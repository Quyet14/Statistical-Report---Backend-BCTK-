import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { KpiScoreEntity } from './entities/kpi-score.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

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

  async getUserKpi(
    userId: number,
    periodType: 'week' | 'month',
    viewer: AuthenticatedUser,
  ) {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự');
    const allowed =
      viewer.role === 'admin' ||
      (viewer.role === 'manager' &&
        viewer.departmentId != null &&
        user.departmentId != null &&
        Number(viewer.departmentId) === Number(user.departmentId)) ||
      (viewer.role === 'staff' && viewer.id === userId);
    if (!allowed)
      throw new ForbiddenException(
        'Bạn không có quyền xem KPI của nhân sự này',
      );
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

  async getRanking(periodType: 'week' | 'month', viewer: AuthenticatedUser) {
    const isAdmin = viewer.role === 'admin';
    if (!isAdmin && viewer.role !== 'manager')
      throw new ForbiddenException('Bạn không có quyền xem bảng xếp hạng KPI');
    if (!isAdmin && viewer.departmentId == null) return [];
    const users = await this.usersRepository.find({
      where: isAdmin ? {} : { departmentId: viewer.departmentId! },
    });
    if (!users.length) return [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const tasks = await this.tasksRepository.find({
      where: { assigneeId: In(users.map((user) => user.id)) },
    });
    const grouped = new Map<number, TaskEntity[]>();
    for (const task of tasks) {
      if (task.assigneeId == null || !usersById.has(task.assigneeId)) continue;
      grouped.set(task.assigneeId, [
        ...(grouped.get(task.assigneeId) ?? []),
        task,
      ]);
    }
    return [...grouped.entries()]
      .map(([userId, userTasks]) => ({
        userId,
        name: usersById.get(userId)!.name,
        departmentId: usersById.get(userId)!.departmentId ?? null,
        score:
          (userTasks.filter((task) => task.status === 'done').length /
            userTasks.length) *
          100,
        periodType,
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.name.localeCompare(right.name),
      );
  }

  upsertScore(
    userId: number,
    periodType: 'week' | 'month',
    periodValue: string,
    data: any,
  ) {
    return { id: Date.now(), userId, periodType, periodValue, ...data };
  }
}
