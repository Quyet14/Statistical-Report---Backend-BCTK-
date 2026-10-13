import { IsString } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  title: string;
}
