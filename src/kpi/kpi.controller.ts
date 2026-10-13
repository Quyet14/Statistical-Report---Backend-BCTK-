import { Controller, Get, Param, Query } from '@nestjs/common';
import { KpiService } from './kpi.service';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('user/:id')
  getUserKpi(@Param('id') id: string, @Query('period') period = 'month') {
    return this.kpiService.getUserKpi(+id, period as 'week' | 'month');
  }

  @Get('ranking')
  getRanking(@Query('period') period = 'month') {
    return this.kpiService.getRanking(period as 'week' | 'month');
  }
}
