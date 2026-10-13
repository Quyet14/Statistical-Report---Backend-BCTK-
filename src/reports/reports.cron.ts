import { Injectable } from '@nestjs/common';

@Injectable()
export class ReportsCron {
  async generateWeeklyReports() {
    return {
      message: 'Weekly report generation triggered',
      period: 'week',
    };
  }

  async generateMonthlyReports() {
    return {
      message: 'Monthly report generation triggered',
      period: 'month',
    };
  }
}
