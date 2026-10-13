import { IsEnum, IsNumber } from 'class-validator';

export class CheckTaskDto {
  @IsNumber()
  taskId: number;

  @IsNumber()
  userId: number;

  @IsEnum(['done', 'late'])
  status: 'done' | 'late';
}
