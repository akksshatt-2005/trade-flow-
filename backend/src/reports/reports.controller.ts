import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService, CashLedgerReport } from './reports.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('reports')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Retrieves the Cash Ledger report for the active company with optional date filtering.
   * Query params: ?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
   */
  @Get('cash-ledger')
  async getCashLedger(
    @CurrentCompany('id') companyId: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ): Promise<CashLedgerReport> {
    return await this.reportsService.getCashLedger(companyId, fromDate, toDate);
  }
}
