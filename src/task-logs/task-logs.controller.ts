import { Body, Controller, Post } from '@nestjs/common';
import { TaskLogsService } from './task-logs.service';
import { CheckTaskDto } from './dto/check-task.dto';

@Controller('task-logs')
export class TaskLogsController {
  constructor(private readonly taskLogsService: TaskLogsService) {}

  @Post('check')
  checkTask(@Body() dto: CheckTaskDto) {
    return this.taskLogsService.checkTask(dto);
  }
}
