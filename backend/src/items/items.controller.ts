import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ItemsService, ItemWithStock, StockLedgerEntry } from './items.service';
import { CreateItemDto, UpdateItemDto, AdjustStockDto } from './dto/items.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('items')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  /**
   * Creates an item scoped to the tenant.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentCompany('id') companyId: string,
    @Body() dto: CreateItemDto,
  ): Promise<{ item: ItemWithStock }> {
    const item = await this.itemsService.create(companyId, dto);
    return { item };
  }

  /**
   * Lists all items for the tenant with live calculated current stock.
   */
  @Get()
  async findAll(
    @CurrentCompany('id') companyId: string,
  ): Promise<{ items: ItemWithStock[] }> {
    const items = await this.itemsService.findAll(companyId);
    return { items };
  }

  /**
   * Retrieves single item details with calculated stock.
   */
  @Get(':id')
  async findOne(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ item: ItemWithStock }> {
    const item = await this.itemsService.findOne(companyId, id);
    return { item };
  }

  /**
   * Returns complete immutable stock movement ledger for an item.
   */
  @Get(':id/ledger')
  async getLedger(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
  ): Promise<{ ledger: StockLedgerEntry[] }> {
    const ledger = await this.itemsService.getLedger(companyId, id);
    return { ledger };
  }

  /**
   * Updates item metadata (opening stock cannot be modified).
   */
  @Patch(':id')
  async update(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<{ item: ItemWithStock }> {
    const item = await this.itemsService.update(companyId, id, dto);
    return { item };
  }

  /**
   * Manually adjusts stock up or down with required reason.
   */
  @Post(':id/adjust-stock')
  @HttpCode(HttpStatus.OK)
  async adjustStock(
    @CurrentCompany('id') companyId: string,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ): Promise<{ success: boolean; new_stock: number; movement: StockLedgerEntry }> {
    return this.itemsService.adjustStock(companyId, id, dto);
  }
}
