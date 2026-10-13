import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KpiScoreEntity } from './entities/kpi-score.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

@Injectable()
export class KpiService {
  constructor(
    @InjectRepository(KpiScoreEntity)
    private readonly scoresRepository: Repository<KpiScoreEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
  ) {}

  async getUserKpi(userId: number, periodType: 'week' | 'month') {
    const tasks = await this.tasksRepository.find({
      where: { assigneeId: userId },
    });
    const completedCount = tasks.filter(
      (task) => task.status === 'done',
    ).length;
    return {
      userId,
      periodType,
      completedCount,
      lateCount: 0,
      score: tasks.length ? (completedCount / tasks.length) * 100 : 0,
    };
  }

  async getRanking(periodType: 'week' | 'month') {
    const tasks = await this.tasksRepository.find();
    const users = await this.usersRepository.find();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const grouped = new Map<number, TaskEntity[]>();
    for (const task of tasks) {
      if (task.assigneeId === null || task.assigneeId === undefined) continue;
      grouped.set(task.assigneeId, [
        ...(grouped.get(task.assigneeId) ?? []),
        task,
      ]);
    }

    return [...grouped.entries()]
      .map(([userId, userTasks]) => ({
        userId,
        name: usersById.get(userId)?.name ?? `Nhân sự ${userId}`,
        score:
          (userTasks.filter((task) => task.status === 'done').length /
            userTasks.length) *
          100,
        periodType,
      }))
      .sort((left, right) => right.score - left.score);
  }

  upsertScore(
    userId: number,
    periodType: 'week' | 'month',
    periodValue: string,
    data: any,
  ) {
    return {
      id: Date.now(),
      userId,
      periodType,
      periodValue,
      ...data,
    };
  }
}
