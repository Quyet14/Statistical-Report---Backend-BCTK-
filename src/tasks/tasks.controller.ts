import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Req() req: any, @Query('assigneeId') assigneeId?: string) {
    const filter =
      req.user.role === 'admin' || req.user.role === 'manager'
        ? assigneeId
          ? +assigneeId
          : undefined
        : req.user.id;
    return this.tasksService.findAll(filter);
  }

  @Get('mine')
  getMyTasks(@Req() req: any) {
    return this.tasksService.getMine(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const task = await this.tasksService.findOne(+id);
    if (req.user.role === 'staff' && task.assigneeId !== req.user.id) {
      throw new ForbiddenException('Bạn không có quyền xem task này');
    }
    return task;
  }

  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateTaskDto, @Req() req: any) {
    return this.tasksService.create(dto, req.user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.update(+id, dto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.remove(+id, req.user);
  }

  @Post(':id/checklist')
  addChecklist(
    @Param('id') id: string,
    @Body() dto: CreateChecklistItemDto,
    @Req() req: any,
  ) {
    return this.tasksService.addChecklistItem(+id, req.user, dto);
  }

  @Patch(':id/checklist/:itemId')
  updateChecklist(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: any,
  ) {
    return this.tasksService.updateChecklistItem(+id, +itemId, req.user, dto);
  }
}
