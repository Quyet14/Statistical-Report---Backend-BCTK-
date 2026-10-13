import { Controller, Get, Post, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
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
