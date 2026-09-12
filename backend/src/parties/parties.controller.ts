import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PartiesService, Party, PartySummary } from './parties.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/parties.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('parties')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  /**
   * Creates a party (customer, vendor, or both) scoped to the active tenant.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentCompany('id') companyId: string,
    @Body() dto: CreatePartyDto,
  ): Promise<{ party: Party }> {
    const party = await this.partiesService.create(companyId, dto);
    return { party };
  }

  /**
   * Lists all parties for the company with optional type filter (?type=customer|vendor|both).
   */
  @Get()
  async findAll(
    @CurrentCompany('id') companyId: string,
    @Query('type') type?: string,
  ): Promise<{ parties: Party[] }> {
    const parties = await this.partiesService.findAll(companyId, type);
    return { parties };
  }

  /**
   * Retrieves single party details.
   */
  @Get(':id')
  async findOne(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ party: Party }> {
    const party = await this.partiesService.findOne(companyId, id);
    return { party };
  }

  /**
   * Updates party details. Blocks type change if invoices exist and protects system Cash account.
   */
  @Patch(':id')
  async update(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
  ): Promise<{ party: Party }> {
    const party = await this.partiesService.update(companyId, id, dto);
    return { party };
  }

  /**
   * Deletes a party if not a system account and no linked invoices exist.
   */
  @Delete(':id')
  async delete(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return await this.partiesService.delete(companyId, id);
  }

  /**
   * Returns lightweight summary of invoices and totals for this party.
   */
  @Get(':id/summary')
  async getSummary(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ summary: PartySummary }> {
    const summary = await this.partiesService.getSummary(companyId, id);
    return { summary };
  }
}
