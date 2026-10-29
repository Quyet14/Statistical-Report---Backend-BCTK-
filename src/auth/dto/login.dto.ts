import { IsEmail, IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { DeviceDto } from './device.dto';

export class LoginDto extends DeviceDto {
  @IsOptional() @IsBoolean() rememberDevice?: boolean;
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
