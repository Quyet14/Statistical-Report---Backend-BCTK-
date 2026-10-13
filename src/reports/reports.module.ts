import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsCron } from './reports.cron';
import { ReportEntity } from './entities/report.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReportEntity, TaskEntity])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsCron],
  exports: [ReportsService],
})
export class ReportsModule {}
