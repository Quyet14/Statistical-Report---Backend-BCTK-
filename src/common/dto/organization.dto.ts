import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @Length(1, 255)
  name: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;
}

export class CreateDepartmentDto extends CreateBranchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}

export class UpdateDepartmentDto extends UpdateBranchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}
