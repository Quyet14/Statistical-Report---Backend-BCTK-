import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TaskLogsService } from './task-logs.service';
import { CheckTaskDto } from './dto/check-task.dto';

@Controller('task-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class TaskLogsController {
  constructor(private readonly taskLogsService: TaskLogsService) {}

  @Post('check')
  checkTask(@Body() dto: CheckTaskDto) {
    return this.taskLogsService.checkTask(dto);
  }
}
