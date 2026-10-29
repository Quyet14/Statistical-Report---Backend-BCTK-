import { Matches, IsEmail, IsString, IsBoolean, IsOptional } from 'class-validator';
import { DeviceDto } from './device.dto';

export class VerifyLoginOtpDto extends DeviceDto {
  @IsOptional() @IsBoolean() rememberDevice?: boolean;
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  otp: string;
}
