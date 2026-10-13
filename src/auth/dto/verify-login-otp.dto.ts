import { IsEmail, IsString } from 'class-validator';

export class VerifyLoginOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;
}
