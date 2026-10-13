import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckTaskDto } from './dto/check-task.dto';
import { TaskLogEntity } from './entities/task-log.entity';

@Injectable()
export class TaskLogsService {
  constructor(
    @InjectRepository(TaskLogEntity)
    private readonly taskLogsRepository: Repository<TaskLogEntity>,
  ) {}

  checkTask(dto: CheckTaskDto) {
    return this.taskLogsRepository.save(
      this.taskLogsRepository.create({
        taskId: dto.taskId,
        userId: dto.userId,
        logDate: new Date().toISOString().slice(0, 10),
        status: dto.status,
      }),
    );
  }

  getStatsForPeriod(userId: number, periodType: 'week' | 'month') {
    return {
      userId,
      periodType,
      periodValue: periodType === 'week' ? '2026-W37' : '2026-09',
      completedCount: 8,
      lateCount: 1,
      score: 92.5,
    };
  }
}
