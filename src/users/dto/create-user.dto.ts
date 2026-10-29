import {
  IsInt,
  Min,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEnum(['admin', 'manager', 'staff'])
  role?: 'admin' | 'manager' | 'staff';

  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;
}
