import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService, CompanyWithRole } from './companies.service';
import { CreateCompanyDto, UpdateCashOpeningBalanceDto } from './dto/create-company.dto';
import { SupabaseAuthGuard, AuthenticatedUser } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompanyScopeGuard } from './guards/company-scope.guard';
import { CurrentCompany } from './decorators/current-company.decorator';

@Controller('companies')
@UseGuards(SupabaseAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * Returns all companies the logged-in user belongs to with their role.
   */
  @Get('mine')
  async getMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ companies: CompanyWithRole[] }> {
    const companies = await this.companiesService.getMine(user.id);
    return { companies };
  }

  /**
   * Creates a new company tenant and links the creator as 'owner'.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
  ): Promise<{ company: CompanyWithRole }> {
    const company = await this.companiesService.create(user.id, dto);
    return { company };
  }

  /**
   * Validates active tenant scope access and returns scoped company info.
   */
  @Get('current')
  @UseGuards(CompanyScopeGuard)
  async getCurrentScopedCompany(
    @CurrentCompany() companyContext: any,
  ) {
    return { context: companyContext };
  }

  /**
   * Updates the cash opening balance for the currently scoped company.
   */
  @Patch('current/cash-opening-balance')
  @UseGuards(CompanyScopeGuard)
  async updateCurrentCashOpeningBalance(
    @CurrentCompany() companyContext: any,
    @Body() dto: UpdateCashOpeningBalanceDto,
  ) {
    const result = await this.companiesService.updateCashOpeningBalance(
      companyContext.company_id,
      dto.cash_opening_balance,
    );
    return result;
  }

  /**
   * Updates the cash opening balance for a specific company by ID.
   */
  @Patch(':id/cash-opening-balance')
  async updateCashOpeningBalanceById(
    @Param('id') companyId: string,
    @Body() dto: UpdateCashOpeningBalanceDto,
  ) {
    const result = await this.companiesService.updateCashOpeningBalance(
      companyId,
      dto.cash_opening_balance,
    );
    return result;
  }
}
