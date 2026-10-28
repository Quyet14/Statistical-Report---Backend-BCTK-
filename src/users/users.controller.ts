import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Req() req: { user: AuthenticatedUser }) {
    return this.usersService.findVisible(req.user);
  }

  @Get('managed')
  @Roles('admin', 'manager')
  findManaged(@Req() req: { user: AuthenticatedUser }) {
    return this.usersService.findManaged(req.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.usersService.findVisibleOne(id, req.user);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return req.user.role === 'admin'
      ? this.usersService.update(id, dto)
      : this.usersService.updateInDepartment(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}
