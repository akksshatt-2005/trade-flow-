import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService, CompanyWithRole } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
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
}
