import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { DeviceDto, DeviceLogoutDto } from './dto/device.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: AuthenticatedUser }) {
    const { id, name, email, role, departmentId } = req.user;
    return { id, name, email, role, departmentId };
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshSessionDto) { return this.authService.refresh(dto.refreshToken); }

  @Post('logout')
  logout(@Body() dto: DeviceLogoutDto) { return this.authService.logout(dto.refreshToken, dto.deviceToken, dto.userAgent); }

  @Post('end-session')
  endSession(@Body() dto: RefreshSessionDto) { return this.authService.logout(dto.refreshToken); }

  @Post('device-status')
  deviceStatus(@Body() dto: DeviceDto) { return this.authService.deviceStatus(dto.deviceToken, dto.userAgent); }

  @Post('resume-device')
  resumeDevice(@Body() dto: DeviceDto) { return this.authService.resumeDevice(dto.deviceToken, dto.userAgent); }

  @Post('forget-device')
  forgetDevice(@Body() dto: DeviceLogoutDto) { return this.authService.forgetDevice(dto.deviceToken, dto.userAgent, dto.refreshToken); }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-login-otp')
  verifyLoginOtp(@Body() dto: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
