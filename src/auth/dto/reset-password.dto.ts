import { Matches, IsEmail, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  otp: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
