import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
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
  ) {}

  private generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async setOtp(
    email: string,
    otp: string,
    purpose: 'login' | 'reset-password',
  ) {
    const normalizedEmail = email.toLowerCase();
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

  private async getOtp(email: string, purpose: 'login' | 'reset-password') {
    const record = await this.otpRepository.findOne({
      where: { email: email.toLowerCase(), purpose },
    });

    if (!record) return null;
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      await this.otpRepository.delete(record.id);
      return null;
    }

    return record.otp;
  }

  private async clearOtp(email: string, purpose: 'login' | 'reset-password') {
    const record = await this.otpRepository.findOne({
      where: { email: email.toLowerCase(), purpose },
    });
    if (record) {
      await this.otpRepository.delete(record.id);
    }
  }

  async getOtpForTest(email: string) {
    const record = await this.otpRepository.findOne({
      where: { email: email.toLowerCase() },
      order: { createdAt: 'DESC' },
    });

    return record?.otp ?? '000000';
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email không tồn tại trong hệ thống');
    }

    if (
      !user.password ||
      !(await bcrypt.compare(loginDto.password, user.password))
    ) {
      throw new UnauthorizedException('Mật khẩu không đúng');
    }

    const otp = this.generateOtp();
    await this.setOtp(user.email, otp, 'login');
    await this.emailService.sendOtpEmail(user.email, otp);

    return {
      message:
        'Mã OTP đã được gửi về email. Vui lòng nhập mã để xác minh đăng nhập.',
      email: user.email,
    };
  }

  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email không tồn tại');
    }

    const otp = await this.getOtp(dto.email, 'login');
    if (!otp || otp !== dto.otp) {
      throw new UnauthorizedException('OTP không đúng hoặc đã hết hạn');
    }

    await this.clearOtp(dto.email, 'login');

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'bctk-super-secret-key',
    );
    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      process.env.JWT_SECRET || 'bctk-super-secret-key',
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email không tồn tại trong hệ thống');
    }

    const otp = this.generateOtp();
    await this.setOtp(user.email, otp, 'reset-password');
    await this.emailService.sendOtpEmail(user.email, otp);

    return {
      message: 'Mã OTP khôi phục mật khẩu đã được gửi về email.',
      email: user.email,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email không tồn tại');
    }

    const otp = await this.getOtp(dto.email, 'reset-password');
    if (!otp || otp !== dto.otp) {
      throw new UnauthorizedException('OTP không đúng hoặc đã hết hạn');
    }

    this.usersService.updatePassword(dto.email, dto.newPassword);
    await this.clearOtp(dto.email, 'reset-password');

    return {
      message: 'đổi mật khẩu mới thành công',
      email: dto.email,
    };
  }
}
