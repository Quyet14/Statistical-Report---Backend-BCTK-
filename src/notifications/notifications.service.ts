import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NotificationEntity } from './entities/notification.entity';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private reminderInterval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
  ) {}

  async onModuleInit() {
    await this.createTaskReminders();
    this.reminderInterval = setInterval(
      () => {
        void this.createTaskReminders();
      },
      15 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.reminderInterval) clearInterval(this.reminderInterval);
  }

  async findForUser(userId: number) {
    return this.notificationsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.notificationsRepository.findOneBy({
      id,
      userId,
    });
    if (notification && !notification.readAt) {
      notification.readAt = new Date();
      await this.notificationsRepository.save(notification);
    }
    return this.notificationsRepository.findOneBy({ id, userId });
  }

  async createTaskReminders() {
    const today = this.getVietnamDate();
    const tomorrow = this.addDays(today, 1);
    const tasks = await this.tasksRepository.find();

    for (const task of tasks) {
      if (!task.assigneeId || task.status === 'done' || !task.dueDate) continue;

      const dueDate = this.toDateKey(task.dueDate);
      const type =
        dueDate < today
          ? 'overdue'
          : dueDate <= tomorrow
            ? 'upcoming'
            : undefined;
      if (!type) continue;

      const title = type === 'overdue' ? 'Task đã quá hạn' : 'Task sắp đến hạn';
      const message =
        type === 'overdue'
          ? `Task "${task.title}" đã quá hạn từ ${dueDate}.`
          : `Task "${task.title}" cần hoàn thành trước ${dueDate}.`;

      const existing = await this.notificationsRepository.findOneBy({
        taskId: task.id,
        userId: task.assigneeId,
        notificationDate: today,
      });
      if (!existing) {
        await this.notificationsRepository.save(
          this.notificationsRepository.create({
            taskId: task.id,
            userId: task.assigneeId,
            title,
            message,
            type,
            notificationDate: today,
          }),
        );
      }
    }
  }

  private getVietnamDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  private addDays(dateKey: string, days: number) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private toDateKey(value: string | Date) {
    if (typeof value === 'string') return value.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
}
