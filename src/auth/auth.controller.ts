import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
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
