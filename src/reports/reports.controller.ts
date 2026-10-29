import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  findAll(
    @Query('period') period = 'week',
    @Query('date') date?: string,
    @Query('scope') scope = 'department',
    @Query('scopeId') scopeId?: string,
  ) {
    return this.reportsService.findAll(
      period as 'day' | 'week' | 'month',
      scope,
      scopeId ? +scopeId : undefined,
      date,
    );
  }

  @Post('generate')
  generate() {
    return this.reportsService.generate();
  }
}
