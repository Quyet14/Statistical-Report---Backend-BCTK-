import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskEntity } from './entities/task.entity';
import { TaskChecklistItemEntity } from './entities/task-checklist-item.entity';
import { TaskLogEntity } from '../task-logs/entities/task-log.entity';
import { TaskLogsService } from '../task-logs/task-logs.service';
import { UserEntity } from '../users/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskEntity,
      TaskChecklistItemEntity,
      TaskLogEntity,
      UserEntity,
      DepartmentEntity,
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskLogsService],
  exports: [TasksService],
})
export class TasksModule {}
