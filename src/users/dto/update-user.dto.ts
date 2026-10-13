import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(['admin', 'manager', 'staff'])
  role?: 'admin' | 'manager' | 'staff';

  @IsOptional()
  branchId?: number;

  @IsOptional()
  departmentId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
