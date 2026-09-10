import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SalesService, SalesInvoice } from './sales.service';
import { CreateSalesDto } from './dto/sales.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('sales')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /**
   * Creates a draft sales invoice with dynamic GST preview.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentCompany('id') companyId: string,
    @Body() dto: CreateSalesDto,
  ): Promise<{ invoice: SalesInvoice }> {
    const invoice = await this.salesService.create(companyId, dto);
    return { invoice };
  }

  /**
   * Lists all sales invoices with tax totals for the company.
   */
  @Get()
  async findAll(
    @CurrentCompany('id') companyId: string,
  ): Promise<{ invoices: SalesInvoice[] }> {
    const invoices = await this.salesService.findAll(companyId);
    return { invoices };
  }

  /**
   * Retrieves single sales invoice with lines and GST breakdown.
   */
  @Get(':id')
  async findOne(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: SalesInvoice }> {
    const invoice = await this.salesService.findOne(companyId, id);
    return { invoice };
  }

  /**
   * Confirms a draft sales invoice with atomic stock shortage verification.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: SalesInvoice }> {
    const invoice = await this.salesService.confirm(companyId, id);
    return { invoice };
  }

  /**
   * Cancels a draft sales invoice.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: SalesInvoice }> {
    const invoice = await this.salesService.cancel(companyId, id);
    return { invoice };
  }
}
