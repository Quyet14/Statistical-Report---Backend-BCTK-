import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskEntity } from './entities/task.entity';
import { TaskLogEntity } from '../task-logs/entities/task-log.entity';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { TaskChecklistItemEntity } from './entities/task-checklist-item.entity';
import { UserEntity } from '../users/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(TaskLogEntity)
    private readonly taskLogsRepository: Repository<TaskLogEntity>,
    @InjectRepository(TaskChecklistItemEntity)
    private readonly checklistRepository: Repository<TaskChecklistItemEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly departmentsRepository: Repository<DepartmentEntity>,
  ) {}

  async findAll(assigneeId?: number) {
    const tasks = await this.tasksRepository.find({
      where: assigneeId === undefined ? undefined : { assigneeId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(tasks.map((task) => this.findOne(task.id)));
  }

  async findOne(id: number) {
    const task = await this.tasksRepository.findOneBy({ id });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const checklist = await this.checklistRepository.find({
      where: { taskId: id },
      order: { sortOrder: 'ASC' },
    });
    const user = task.assigneeId
      ? await this.usersRepository.findOneBy({ id: task.assigneeId })
      : null;
    const department = user?.departmentId
      ? await this.departmentsRepository.findOneBy({ id: user.departmentId })
      : null;
    const rawDueDate = task.dueDate as unknown;
    const dueDateKey =
      rawDueDate instanceof Date
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(rawDueDate)
        : typeof rawDueDate === 'string'
          ? rawDueDate.slice(0, 10)
          : undefined;
    return {
      ...task,
      assignee: user?.name ?? 'Chưa phân công',
      department: department?.name ?? 'Chưa có phòng ban',
      time: dueDateKey ?? 'Chưa có thời gian',
      dueDate: dueDateKey,
      checklist,
    };
  }

  getMine(userId: number) {
    return this.findAll(userId);
  }

  create(dto: CreateTaskDto, createdById: number) {
    const { checklist = [], ...taskData } = dto;
    return this.tasksRepository
      .save(this.tasksRepository.create({ ...taskData, createdById }))
      .then(async (task) => {
        if (checklist.length) {
          await this.checklistRepository.save(
            checklist.map((title, index) =>
              this.checklistRepository.create({
                taskId: task.id,
                title,
                sortOrder: index,
              }),
            ),
          );
        }
        await this.taskLogsRepository.save(
          this.taskLogsRepository.create({
            taskId: task.id,
            userId: task.assigneeId ?? 1,
            logDate: new Date().toISOString().slice(0, 10),
            status: task.status === 'done' ? 'done' : 'pending',
          }),
        );
        return task;
      });
  }

  async addChecklistItem(
    taskId: number,
    user: { id: number; role: string },
    dto: CreateChecklistItemDto,
  ) {
    const task = await this.findOne(taskId);
    this.assertCanWorkOnTask(task, user);
    const last = await this.checklistRepository.findOne({
      where: { taskId },
      order: { sortOrder: 'DESC' },
    });
    const item = await this.checklistRepository.save(
      this.checklistRepository.create({
        taskId,
        title: dto.title,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      }),
    );
    return this.recalculateProgress(taskId, item);
  }

  async updateChecklistItem(
    taskId: number,
    itemId: number,
    user: { id: number; role: string },
    dto: UpdateChecklistItemDto,
  ) {
    const task = await this.findOne(taskId);
    this.assertCanWorkOnTask(task, user);
    const item = await this.checklistRepository.findOneBy({
      id: itemId,
      taskId,
    });
    if (!item) throw new NotFoundException('Checklist item not found');
    Object.assign(item, dto);
    if (dto.completed !== undefined)
      item.completedAt = dto.completed ? new Date() : undefined;
    await this.checklistRepository.save(item);
    return this.recalculateProgress(taskId, item);
  }

  private assertCanWorkOnTask(
    task: TaskEntity,
    user: { id: number; role: string },
  ) {
    if (user.role === 'admin' || user.role === 'manager') return;
    if (task.assigneeId !== user.id) {
      throw new ForbiddenException('Bạn không được cập nhật task này');
    }
  }

  private async recalculateProgress(
    taskId: number,
    item: TaskChecklistItemEntity,
  ) {
    const items = await this.checklistRepository.findBy({ taskId });
    const progress = items.length
      ? Math.round(
          (items.filter((entry) => entry.completed).length * 100) /
            items.length,
        )
      : 0;
    const status = progress === 100 ? 'done' : progress > 0 ? 'doing' : 'todo';
    await this.tasksRepository.update(taskId, { progress, status });
    return { ...item, progress, status };
  }

  async update(
    id: number,
    dto: UpdateTaskDto,
    actor: { id: number; role: string },
  ) {
    const existing = await this.tasksRepository.findOneBy({ id });
    if (!existing) throw new NotFoundException('Task not found');
    const isAdmin = actor.role === 'admin';
    const isCreator = existing.createdById === actor.id;
    const isAssignee = existing.assigneeId === actor.id;
    if (!isAdmin && !isCreator && !isAssignee) {
      throw new ForbiddenException('Bạn không có quyền cập nhật task này');
    }
    if (!isAdmin && !isCreator) {
      const allowedUpdate: UpdateTaskDto = {
        progress: dto.progress,
        status: dto.status,
      };
      return this.saveUpdatedTask(id, allowedUpdate);
    }
    return this.saveUpdatedTask(id, dto);
  }

  private async saveUpdatedTask(id: number, dto: UpdateTaskDto) {
    const task = await this.tasksRepository.preload({ id, ...dto });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const savedTask = await this.tasksRepository.save(task);
    if (dto.status !== undefined) {
      await this.taskLogsRepository.save(
        this.taskLogsRepository.create({
          taskId: savedTask.id,
          userId: savedTask.assigneeId ?? 1,
          logDate: new Date().toISOString().slice(0, 10),
          status: savedTask.status === 'done' ? 'done' : 'pending',
        }),
      );
    }
    return savedTask;
  }

  async remove(id: number, actor: { id: number; role: string }) {
    const task = await this.tasksRepository.findOneBy({ id });
    if (!task) throw new NotFoundException('Task not found');
    if (actor.role !== 'admin' && task.createdById !== actor.id) {
      throw new ForbiddenException('Chỉ người giao task mới được xoá task');
    }
    const result = await this.tasksRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Task not found');
    }
    return { deleted: true };
  }
}
