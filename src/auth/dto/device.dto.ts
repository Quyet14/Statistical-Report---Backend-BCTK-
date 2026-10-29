import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class DeviceDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/) deviceToken?: string;
  @IsOptional() @IsString() @MaxLength(512) userAgent?: string;
}
export class DeviceLogoutDto extends DeviceDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/) refreshToken?: string;
}
