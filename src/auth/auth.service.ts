import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { MoreThan, Repository } from 'typeorm';
import { createHmac, randomInt } from 'node:crypto';
import { jwtSecret } from '../common/security-config';
import { UsersService } from '../users/users.service';
import { RefreshSessions, SESSION_MAX_MS } from '../common/refresh-sessions';
import { TrustedDevices } from '../common/trusted-devices';
import { EmailService } from './email.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { OtpTokenEntity } from './entities/otp-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @Inject('OTP_TOKEN_REPOSITORY')
    private readonly otpRepository: Repository<OtpTokenEntity>,
    private readonly sessions: RefreshSessions = new RefreshSessions(),
    private readonly devices: TrustedDevices = new TrustedDevices(),
  ) {}

  private generateOtp() {
    return String(randomInt(100000, 1000000));
  }

  private hashOtp(
    email: string,
    otp: string,
    purpose: string,
    tokenVersion: number,
  ) {
    return createHmac('sha256', jwtSecret())
      .update(JSON.stringify([email.toLowerCase(), purpose, otp, tokenVersion]))
      .digest('hex');
  }

  private async setOtp(
    email: string,
    otp: string,
    purpose: 'login' | 'reset-password',
    tokenVersion: number,
  ) {
    const normalizedEmail = email.toLowerCase();
    otp = this.hashOtp(normalizedEmail, otp, purpose, tokenVersion);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const record = await this.otpRepository.findOne({
      where: { email: normalizedEmail, purpose },
    });

    if (record) {
      record.otp = otp;
      record.expiresAt = expiresAt;
      await this.otpRepository.save(record);
      return;
    }

    await this.otpRepository.save({
      email: normalizedEmail,
      otp,
      purpose,
      expiresAt,
    });
  }

  private async consumeOtp(
    email: string,
    otp: string,
    purpose: 'login' | 'reset-password',
    tokenVersion: number,
  ) {
    const result = await this.otpRepository.delete({
      email: email.toLowerCase(),
      purpose,
      otp: this.hashOtp(email, otp, purpose, tokenVersion),
      expiresAt: MoreThan(new Date()),
    });
    return result.affected === 1;
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (
      !user.password ||
      !(await bcrypt.compare(loginDto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const proof = await this.devices.inspect(loginDto.deviceToken, loginDto.userAgent ?? '');
    if (proof && proof.record.userId === user.id && proof.record.version === (user.tokenVersion ?? 0)) {
      if (loginDto.rememberDevice === false) {
        await this.devices.change(loginDto.deviceToken!, loginDto.userAgent ?? '', 'forget');
        const session = await this.sessions.create(user);
        return this.sessionResponse(user, session.sid, session.refreshToken, session.record.created);
      }
      const device = await this.devices.change(loginDto.deviceToken!, loginDto.userAgent ?? '', 'login', loginDto.rememberDevice === true);
      if (device) {
        const session = await this.sessions.create(user, device.id);
        return { ...this.sessionResponse(user, session.sid, session.refreshToken, session.record.created), deviceToken: device.token, deviceExpiresAt: device.record.expires };
      }
    }
    const otp = this.generateOtp();
    await this.setOtp(user.email, otp, 'login', user.tokenVersion ?? 0);
    await this.emailService.sendOtpEmail(user.email, otp);

    return {
      message:
        'Mã OTP đã được gửi về email. Vui lòng nhập mã để xác minh đăng nhập.',
      email: user.email,
    };
  }

  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email không tồn tại');
    }

    if (
      !(await this.consumeOtp(
        dto.email,
        dto.otp,
        'login',
        user.tokenVersion ?? 0,
      ))
    ) {
      throw new UnauthorizedException('OTP không đúng hoặc đã hết hạn');
    }

    if (dto.deviceToken) await this.devices.change(dto.deviceToken, dto.userAgent ?? '', 'forget');
    const device = dto.rememberDevice === true ? await this.devices.create(user, dto.userAgent ?? '') : null;
    const session = await this.sessions.create(user, device?.id);
    return { ...this.sessionResponse(user, session.sid, session.refreshToken, session.record.created), ...(device ? { deviceToken: device.token, deviceExpiresAt: device.record.expires } : {}) };
  }

  private sessionResponse(user: { id: number; email: string; name: string; role: string; tokenVersion?: number; departmentId?: number | null }, sid: string, refreshToken: string, created: number) {
    const now = Math.floor(Date.now() / 1000);
    const absolute = Math.floor((created + SESSION_MAX_MS) / 1000);
    const accessToken = jwt.sign({ sub: user.id, type: 'access', sid, tokenVersion: user.tokenVersion ?? 0, exp: Math.min(now + 900, absolute) }, jwtSecret(), { algorithm: 'HS256' });
    return { accessToken, refreshToken, sessionExpiresAt: created + SESSION_MAX_MS, user: { id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId ?? null } };
  }

  async refresh(refreshToken: string) {
    const { sid, record } = await this.sessions.inspect(refreshToken);
    const user = await this.usersService.findByEmail(record.email);
    if (!user || !user.isActive || user.id !== record.userId || (user.tokenVersion ?? 0) !== record.version) {
      await this.sessions.revoke(sid);
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
    }
    if (record.deviceId) {
      const device = await this.devices.get(record.deviceId);
      if (!device || device.userId !== user.id || device.version !== (user.tokenVersion ?? 0)) { await this.sessions.revoke(sid); throw new UnauthorizedException('Thiết bị không còn được ghi nhớ'); }
    }
    const next = await this.sessions.rotate(refreshToken, sid);
    return this.sessionResponse(user, sid, next, record.created);
  }

  async deviceStatus(deviceToken?: string, userAgent = '') {
    const proof = await this.devices.inspect(deviceToken, userAgent);
    if (!proof) return { remembered: false, autoLogin: false };
    const user = await this.usersService.findByEmail(proof.record.email);
    if (!user || !user.isActive || user.id !== proof.record.userId || (user.tokenVersion ?? 0) !== proof.record.version) { await this.devices.revoke(proof.id); return { remembered: false, autoLogin: false }; }
    return { remembered: true, autoLogin: proof.record.autoLogin, expiresAt: proof.record.expires };
  }

  async resumeDevice(deviceToken?: string, userAgent = '') {
    const proof = await this.devices.inspect(deviceToken, userAgent);
    if (!proof || !proof.record.autoLogin) throw new UnauthorizedException('Thiết bị chưa được bật tự đăng nhập');
    const user = await this.usersService.findByEmail(proof.record.email);
    if (!user || !user.isActive || user.id !== proof.record.userId || (user.tokenVersion ?? 0) !== proof.record.version) { await this.devices.revoke(proof.id); throw new UnauthorizedException('Thiết bị không còn được ghi nhớ'); }
    const device = await this.devices.change(deviceToken!, userAgent, 'resume');
    if (!device) throw new UnauthorizedException('Thiết bị không còn được ghi nhớ');
    const session = await this.sessions.create(user, device.id);
    return { ...this.sessionResponse(user, session.sid, session.refreshToken, session.record.created), deviceToken: device.token, deviceExpiresAt: device.record.expires };
  }

  async forgetDevice(deviceToken?: string, userAgent = '', refreshToken?: string) {
    if (deviceToken) await this.devices.change(deviceToken, userAgent, 'forget');
    return this.logout(refreshToken);
  }

  async logout(refreshToken?: string, deviceToken?: string, userAgent = '') {
    if (deviceToken) await this.devices.change(deviceToken, userAgent, 'disable');
    try { const { sid } = await this.sessions.inspect(refreshToken ?? ''); await this.sessions.revoke(sid); }
    catch (error) { if (!(error instanceof UnauthorizedException)) throw error; }
    return { message: 'Đã đăng xuất' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const response = {
      message:
        'If the account is eligible, a password reset OTP has been sent.',
      email: dto.email,
    };
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) return response;
    const otp = this.generateOtp();
    await this.setOtp(
      user.email,
      otp,
      'reset-password',
      user.tokenVersion ?? 0,
    );
    await this.emailService.sendOtpEmail(user.email, otp);
    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email không tồn tại');
    }

    if (
      !(await this.consumeOtp(
        dto.email,
        dto.otp,
        'reset-password',
        user.tokenVersion ?? 0,
      ))
    ) {
      throw new UnauthorizedException('OTP không đúng hoặc đã hết hạn');
    }

    await this.usersService.updatePassword(dto.email, dto.newPassword);

    return {
      message: 'đổi mật khẩu mới thành công',
      email: dto.email,
    };
  }
}
