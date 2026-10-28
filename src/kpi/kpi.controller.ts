import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { KpiService } from './kpi.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('user/:id')
  getUserKpi(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthenticatedUser },
    @Query('period') period = 'month',
  ) {
    return this.kpiService.getUserKpi(id, period as 'week' | 'month', req.user);
  }

  @Get('ranking')
  @Roles('admin', 'manager')
  getRanking(
    @Req() req: { user: AuthenticatedUser },
    @Query('period') period = 'month',
  ) {
    return this.kpiService.getRanking(period as 'week' | 'month', req.user);
  }
}
