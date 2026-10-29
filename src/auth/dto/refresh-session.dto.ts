import { IsString, Matches } from 'class-validator';
export class RefreshSessionDto {
  @IsString()
  @Matches(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/)
  refreshToken!: string;
}
