import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateItemDto, UpdateItemDto, AdjustStockDto } from './dto/items.dto';

export interface ItemWithStock {
  id: string;
  company_id: string;
  name: string;
  sku?: string | null;
  hsn_code?: string | null;
  gst_rate: number;
  unit: string;
  opening_stock: number;
  reorder_threshold: number;
  current_stock: number;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockLedgerEntry {
  id: string;
  company_id: string;
  item_id: string;
  movement_type: 'purchase_in' | 'sale_out' | 'adjustment_in' | 'adjustment_out';
  quantity: number;
  reference_type: string;
  reference_id?: string | null;
  created_at: string;
}

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Helper: Calculates current stock balance for an item by summing stock_ledger entries.
   */
  public calculateStockFromMovements(movements: { movement_type: string; quantity: any }[]): number {
    let balance = 0;
    for (const m of movements) {
      const qty = Number(m.quantity) || 0;
      if (m.movement_type === 'purchase_in' || m.movement_type === 'adjustment_in') {
        balance += qty;
      } else if (m.movement_type === 'sale_out' || m.movement_type === 'adjustment_out') {
        balance -= qty;
      }
    }
    return Math.round(balance * 100) / 100;
  }

  /**
   * Creates a new item in the catalog.
   * If opening_stock > 0, automatically appends an initial adjustment_in entry into stock_ledger.
   */
  async create(companyId: string, dto: CreateItemDto): Promise<ItemWithStock> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Check duplicate SKU within the same company
    if (dto.sku && dto.sku.trim()) {
      const { data: existing } = await admin
        .from('items')
        .select('id')
        .eq('company_id', companyId)
        .eq('sku', dto.sku.trim())
        .maybeSingle();

      if (existing) {
        throw new ConflictException(
          `Item with SKU '${dto.sku.trim()}' already exists in this company.`,
        );
      }
    }

    const openingStock = Number(dto.opening_stock) || 0;
    const reorderThreshold = Number(dto.reorder_threshold) || 0;

    // 2. Insert Item Record
    const insertPayload: any = {
      company_id: companyId,
      name: dto.name.trim(),
      sku: dto.sku?.trim() || null,
      hsn_code: dto.hsn_code?.trim() || null,
      gst_rate: Number(dto.gst_rate) || 0,
      unit: dto.unit?.trim() || 'pcs',
      opening_stock: openingStock,
    };

    if (dto.reorder_threshold !== undefined) {
      insertPayload.reorder_threshold = reorderThreshold;
    }

    let { data: item, error: itemError } = await admin
      .from('items')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    // If reorder_threshold column not yet migrated in Supabase, retry without it
    if (itemError?.message?.includes('reorder_threshold')) {
      delete insertPayload.reorder_threshold;
      const retry = await admin
        .from('items')
        .insert(insertPayload)
        .select()
        .single();
      item = retry.data;
      itemError = retry.error;
    }

    if (itemError || !item) {
      if (itemError?.code === '23505' || itemError?.message?.includes('duplicate key')) {
        throw new ConflictException(
          `Item with SKU '${dto.sku}' already exists in this company.`,
        );
      }
      this.logger.error(`Failed to create item: ${itemError?.message}`);
      throw new InternalServerErrorException(
        itemError?.message || 'Failed to create item record.',
      );
    }

    // 3. Write initial adjustment_in to stock_ledger if opening_stock > 0
    if (openingStock > 0) {
      const { error: ledgerError } = await admin.from('stock_ledger').insert({
        company_id: companyId,
        item_id: item.id,
        movement_type: 'adjustment_in',
        quantity: openingStock,
        reference_type: 'opening_stock',
        reference_id: item.id,
      });

      if (ledgerError) {
        this.logger.error(
          `Failed to record opening stock ledger entry: ${ledgerError.message}`,
        );
        // Note: Do not throw fatal error, stock can still be tracked
      }
    }

    return {
      id: item.id,
      company_id: item.company_id,
      name: item.name,
      sku: item.sku,
      hsn_code: item.hsn_code,
      gst_rate: Number(item.gst_rate) || 0,
      unit: item.unit,
      opening_stock: openingStock,
      reorder_threshold: Number(item.reorder_threshold) || 0,
      current_stock: openingStock,
      is_low_stock: reorderThreshold > 0 && openingStock <= reorderThreshold,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Lists all items for a company with dynamic ledger-calculated stock.
   */
  async findAll(companyId: string): Promise<ItemWithStock[]> {
    const admin = this.supabaseService.getAdminClient();

    // Fetch items
    const { data: items, error: itemsError } = await admin
      .from('items')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (itemsError) {
      this.logger.error(`Error querying items: ${itemsError.message}`);
      throw new InternalServerErrorException('Failed to fetch items list.');
    }

    if (!items || items.length === 0) {
      return [];
    }

    // Fetch all stock ledger entries for this company in a single batch
    const { data: ledgerEntries, error: ledgerError } = await admin
      .from('stock_ledger')
      .select('item_id, movement_type, quantity')
      .eq('company_id', companyId);

    if (ledgerError) {
      this.logger.error(`Error querying stock_ledger: ${ledgerError.message}`);
    }

    // Group ledger entries by item_id
    const ledgerMap = new Map<string, { movement_type: string; quantity: any }[]>();
    for (const entry of ledgerEntries || []) {
      if (!ledgerMap.has(entry.item_id)) {
        ledgerMap.set(entry.item_id, []);
      }
      ledgerMap.get(entry.item_id)!.push(entry);
    }

    return items.map((item) => {
      const movements = ledgerMap.get(item.id) || [];
      const currentStock = this.calculateStockFromMovements(movements);
      const threshold = Number(item.reorder_threshold) || 0;

      return {
        id: item.id,
        company_id: item.company_id,
        name: item.name,
        sku: item.sku,
        hsn_code: item.hsn_code,
        gst_rate: Number(item.gst_rate) || 0,
        unit: item.unit,
        opening_stock: Number(item.opening_stock) || 0,
        reorder_threshold: threshold,
        current_stock: currentStock,
        is_low_stock: threshold > 0 && currentStock <= threshold,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });
  }

  /**
   * Retrieves single item with ledger-calculated current stock.
   */
  async findOne(companyId: string, itemId: string): Promise<ItemWithStock> {
    const admin = this.supabaseService.getAdminClient();

    const { data: item, error: itemError } = await admin
      .from('items')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', itemId)
      .maybeSingle();

    if (itemError || !item) {
      throw new NotFoundException(`Item '${itemId}' not found in this company.`);
    }

    // Calculate stock from ledger
    const { data: movements } = await admin
      .from('stock_ledger')
      .select('movement_type, quantity')
      .eq('company_id', companyId)
      .eq('item_id', itemId);

    const currentStock = this.calculateStockFromMovements(movements || []);
    const threshold = Number(item.reorder_threshold) || 0;

    return {
      id: item.id,
      company_id: item.company_id,
      name: item.name,
      sku: item.sku,
      hsn_code: item.hsn_code,
      gst_rate: Number(item.gst_rate) || 0,
      unit: item.unit,
      opening_stock: Number(item.opening_stock) || 0,
      reorder_threshold: threshold,
      current_stock: currentStock,
      is_low_stock: threshold > 0 && currentStock <= threshold,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Returns complete stock movement history for an item.
   */
  async getLedger(companyId: string, itemId: string): Promise<StockLedgerEntry[]> {
    // Verify item exists
    await this.findOne(companyId, itemId);

    const admin = this.supabaseService.getAdminClient();
    const { data, error } = await admin
      .from('stock_ledger')
      .select('*')
      .eq('company_id', companyId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Error querying item ledger: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch stock movement history.');
    }

    return (data || []).map((entry) => ({
      id: entry.id,
      company_id: entry.company_id,
      item_id: entry.item_id,
      movement_type: entry.movement_type,
      quantity: Number(entry.quantity),
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
      created_at: entry.created_at,
    }));
  }

  /**
   * Updates item metadata. Opening stock cannot be edited.
   */
  async update(companyId: string, itemId: string, dto: UpdateItemDto): Promise<ItemWithStock> {
    if ((dto as any).opening_stock !== undefined) {
      throw new BadRequestException(
        'Opening stock cannot be edited after creation. Use /items/:id/adjust-stock to record stock adjustments.',
      );
    }

    // Verify item exists
    await this.findOne(companyId, itemId);

    const admin = this.supabaseService.getAdminClient();
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.hsn_code !== undefined) updatePayload.hsn_code = dto.hsn_code?.trim() || null;
    if (dto.gst_rate !== undefined) updatePayload.gst_rate = Number(dto.gst_rate);
    if (dto.unit !== undefined) updatePayload.unit = dto.unit?.trim() || 'pcs';
    if (dto.reorder_threshold !== undefined) {
      updatePayload.reorder_threshold = Number(dto.reorder_threshold);
    }

    let { data: updated, error } = await admin
      .from('items')
      .update(updatePayload)
      .eq('company_id', companyId)
      .eq('id', itemId)
      .select()
      .maybeSingle();

    if (error?.message?.includes('reorder_threshold')) {
      delete updatePayload.reorder_threshold;
      const retry = await admin
        .from('items')
        .update(updatePayload)
        .eq('company_id', companyId)
        .eq('id', itemId)
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error || !updated) {
      throw new InternalServerErrorException('Failed to update item details.');
    }

    return this.findOne(companyId, itemId);
  }

  /**
   * Manually adjusts stock up or down.
   * Rejects adjustment_out if it would push current stock below zero.
   */
  async adjustStock(
    companyId: string,
    itemId: string,
    dto: AdjustStockDto,
  ): Promise<{ success: boolean; new_stock: number; movement: StockLedgerEntry }> {
    const item = await this.findOne(companyId, itemId);
    const quantity = Number(dto.quantity);

    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException('Adjustment quantity must be greater than zero.');
    }

    // Normalize movement type
    let movementType: 'adjustment_in' | 'adjustment_out' = 'adjustment_in';
    if (dto.adjustment_type === 'adjustment_out' || dto.adjustment_type === 'out') {
      movementType = 'adjustment_out';
    }

    const currentStock = item.current_stock;

    // Strict Negative Stock Guard
    if (movementType === 'adjustment_out') {
      if (currentStock - quantity < 0) {
        throw new BadRequestException(
          `Cannot adjust stock below zero. Current stock is ${currentStock} ${item.unit}, requested reduction is ${quantity} ${item.unit}.`,
        );
      }
    }

    const admin = this.supabaseService.getAdminClient();

    // Append to immutable stock_ledger
    const { data: movement, error } = await admin
      .from('stock_ledger')
      .insert({
        company_id: companyId,
        item_id: itemId,
        movement_type: movementType,
        quantity: quantity,
        reference_type: dto.reason.trim(),
        reference_id: null,
      })
      .select()
      .single();

    if (error || !movement) {
      this.logger.error(`Failed to append stock ledger adjustment: ${error?.message}`);
      throw new InternalServerErrorException('Failed to record stock adjustment.');
    }

    const newStock =
      movementType === 'adjustment_in'
        ? currentStock + quantity
        : currentStock - quantity;

    return {
      success: true,
      new_stock: Math.round(newStock * 100) / 100,
      movement: {
        id: movement.id,
        company_id: movement.company_id,
        item_id: movement.item_id,
        movement_type: movement.movement_type,
        quantity: Number(movement.quantity),
        reference_type: movement.reference_type,
        reference_id: movement.reference_id,
        created_at: movement.created_at,
      },
    };
  }
}
