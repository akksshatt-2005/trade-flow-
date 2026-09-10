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
import { PurchasesService, PurchaseInvoice } from './purchases.service';
import { CreatePurchaseDto } from './dto/purchases.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('purchases')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  /**
   * Creates a draft purchase invoice.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentCompany('id') companyId: string,
    @Body() dto: CreatePurchaseDto,
  ): Promise<{ invoice: PurchaseInvoice }> {
    const invoice = await this.purchasesService.create(companyId, dto);
    return { invoice };
  }

  /**
   * Lists all purchase invoices for the company.
   */
  @Get()
  async findAll(
    @CurrentCompany('id') companyId: string,
  ): Promise<{ invoices: PurchaseInvoice[] }> {
    const invoices = await this.purchasesService.findAll(companyId);
    return { invoices };
  }

  /**
   * Retrieves single purchase invoice with line items.
   */
  @Get(':id')
  async findOne(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: PurchaseInvoice }> {
    const invoice = await this.purchasesService.findOne(companyId, id);
    return { invoice };
  }

  /**
   * Confirms a draft purchase invoice and records inward stock to stock_ledger.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: PurchaseInvoice }> {
    const invoice = await this.purchasesService.confirm(companyId, id);
    return { invoice };
  }

  /**
   * Cancels a draft purchase invoice.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ invoice: PurchaseInvoice }> {
    const invoice = await this.purchasesService.cancel(companyId, id);
    return { invoice };
  }
}
