import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportEntity } from './entities/report.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ReportEntity)
    private readonly reportsRepository: Repository<ReportEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
  ) {}

  async findAll(
    period: 'day' | 'week' | 'month',
    scope: string,
    scopeId?: number,
    date?: string,
  ) {
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
      ? (date as string)
      : new Date().toISOString().slice(0, 10);
    const selected = new Date(`${selectedDate}T00:00:00Z`);
    const start = new Date(selected);
    const end = new Date(selected);
    if (period === 'week') {
      const mondayOffset = (selected.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - mondayOffset);
      end.setUTCDate(start.getUTCDate() + 6);
    } else if (period === 'month') {
      start.setUTCDate(1);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
    }
    const formatDate = (value: Date) => value.toISOString().slice(0, 10);
    const startDate = formatDate(start);
    const endDate = formatDate(end);
    const toDateKey = (value?: string | Date) => {
      if (value instanceof Date) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(value);
        const values = Object.fromEntries(
          parts.map((part) => [part.type, part.value]),
        );
        return `${values.year}-${values.month}-${values.day}`;
      }
      return value?.slice(0, 10);
    };
    const tasks = (await this.tasksRepository.find()).filter((task) => {
      const taskDate = toDateKey(task.dueDate);
      return (
        taskDate !== undefined && taskDate >= startDate && taskDate <= endDate
      );
    });
    const completedTasks = tasks.filter(
      (task) => task.status === 'done',
    ).length;
    const lateTasks = tasks.filter(
      (task) =>
        task.dueDate &&
        toDateKey(task.dueDate)! < selectedDate &&
        task.status !== 'done',
    ).length;
    const totalTasks = tasks.length;
    const chartData: Array<{ label: string; value: number; done: number }> = [];
    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = formatDate(cursor);
      const dayTasks = tasks.filter((task) => toDateKey(task.dueDate) === key);
      chartData.push({
        label:
          period === 'day'
            ? key.slice(5)
            : period === 'month'
              ? key.slice(8)
              : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][
                  cursor.getUTCDay() === 0 ? 6 : cursor.getUTCDay() - 1
                ],
        value: dayTasks.length
          ? Math.round(
              (dayTasks.filter((task) => task.status === 'done').length * 100) /
                dayTasks.length,
            )
          : 0,
        done: dayTasks.filter((task) => task.status === 'done').length,
      });
    }

    return {
      period,
      date: selectedDate,
      scope,
      scopeId,
      data: {
        totalTasks,
        completedTasks,
        lateTasks,
        avgScore: totalTasks ? (completedTasks / totalTasks) * 100 : 0,
        chartData,
        categories: [],
        highlights: tasks.slice(0, 10).map((task) => ({
          name: task.title,
          status: task.status,
          delta: task.status === 'done' ? 'Hoàn thành' : 'Đang xử lý',
        })),
      },
    };
  }

  generate() {
    return {
      message: 'Reports generated successfully',
      generatedAt: new Date().toISOString(),
    };
  }

  saveReport(
    periodType: 'week' | 'month',
    scope: string,
    scopeId: number,
    data: any,
  ) {
    return {
      id: Date.now(),
      periodType,
      scope,
      scopeId,
      data,
      generatedAt: new Date().toISOString(),
    };
  }
}
