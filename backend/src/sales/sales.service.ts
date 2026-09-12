import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveState } from '../companies/companies.service';
import { CreateSalesDto } from './dto/sales.dto';

export interface SalesInvoiceLine {
  id: string;
  sales_invoice_id: string;
  item_id: string;
  item?: { id: string; name: string; sku?: string | null; unit: string };
  quantity: number;
  rate: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
}

export interface SalesInvoice {
  id: string;
  company_id: string;
  party_id: string;
  party?: { id: string; name: string; phone?: string | null; gst_number?: string | null; state?: string | null };
  invoice_number: string;
  invoice_date: string;
  total_taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_amount: number;
  total_amount: number;
  walkin_name?: string | null;
  walkin_phone?: string | null;
  walkin_address?: string | null;
  is_interstate: boolean;
  status: 'draft' | 'confirmed' | 'cancelled';
  lines?: SalesInvoiceLine[];
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Helper: Calculates current stock balance for an item from stock_ledger.
   */
  private calculateItemStock(movements: { movement_type: string; quantity: any }[]): number {
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
   * Creates a draft sales invoice with dynamic GST intra/inter-state breakdown.
   */
  async create(companyId: string, dto: CreateSalesDto): Promise<SalesInvoice> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Verify customer party exists (customer, both, or system Cash account)
    const { data: party, error: partyError } = await admin
      .from('parties')
      .select('id, name, type, address, gst_number, is_system_account')
      .eq('company_id', companyId)
      .eq('id', dto.party_id)
      .maybeSingle();

    if (partyError || !party) {
      throw new BadRequestException('Selected customer does not exist in this company.');
    }

    const isSystemCash = Boolean(party.is_system_account) || party.name.toLowerCase() === 'cash';
    if (party.type !== 'customer' && party.type !== 'both' && !isSystemCash) {
      throw new BadRequestException(
        `Selected party '${party.name}' has type '${party.type}'. Sales invoices can only be created for customers.`,
      );
    }

    // 2. Check invoice_number uniqueness for this company
    const { data: existingInv } = await admin
      .from('sales_invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('invoice_number', dto.invoice_number.trim())
      .maybeSingle();

    if (existingInv) {
      throw new ConflictException(
        `Sales invoice with number '${dto.invoice_number}' already exists in this company.`,
      );
    }

    // 3. Fetch Company State for GST calculation
    const { data: company } = await admin
      .from('companies')
      .select('address, gst_number')
      .eq('id', companyId)
      .maybeSingle();

    const companyState = resolveState(company);
    const partyState = resolveState(party);

    // If both states are present and differ -> Inter-state (IGST), else Intra-state (CGST + SGST)
    const isInterstate = Boolean(
      companyState && partyState && companyState !== partyState,
    );

    // 4. Compute line items & tax amounts
    let totalTaxable = 0;
    let totalGst = 0;
    let totalAmount = 0;

    const computedLines = [];

    for (const line of dto.lines) {
      const { data: item } = await admin
        .from('items')
        .select('id, name, unit')
        .eq('company_id', companyId)
        .eq('id', line.item_id)
        .maybeSingle();

      if (!item) {
        throw new BadRequestException(
          `Item ID '${line.item_id}' not found in this company.`,
        );
      }

      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      const gstRate = Number(line.gst_rate ?? 0);

      const taxable = Math.round(qty * rate * 100) / 100;
      const gst = Math.round(taxable * (gstRate / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + gst) * 100) / 100;

      totalTaxable += taxable;
      totalGst += gst;
      totalAmount += lineTotal;

      computedLines.push({
        item_id: item.id,
        quantity: qty,
        rate: rate,
        gst_rate: gstRate,
        line_total: lineTotal,
      });
    }

    const invoiceDate = dto.invoice_date || new Date().toISOString().split('T')[0];

    // 5. Insert sales_invoices header (status: 'draft')
    const { data: invoice, error: invoiceError } = await admin
      .from('sales_invoices')
      .insert({
        company_id: companyId,
        party_id: dto.party_id,
        invoice_number: dto.invoice_number.trim(),
        invoice_date: invoiceDate,
        total_amount: Math.round(totalAmount * 100) / 100,
        gst_amount: Math.round(totalGst * 100) / 100,
        walkin_name: dto.walkin_name?.trim() || null,
        walkin_phone: dto.walkin_phone?.trim() || null,
        walkin_address: dto.walkin_address?.trim() || null,
        status: 'draft',
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      if (invoiceError?.code === '23505') {
        throw new ConflictException(
          `Sales invoice with number '${dto.invoice_number}' already exists in this company.`,
        );
      }
      this.logger.error(`Failed to insert sales invoice: ${invoiceError?.message}`);
      throw new InternalServerErrorException('Failed to create sales invoice.');
    }

    // 6. Insert lines
    const linesToInsert = computedLines.map((l) => ({
      sales_invoice_id: invoice.id,
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      gst_rate: l.gst_rate,
      line_total: l.line_total,
    }));

    const { error: linesError } = await admin
      .from('sales_invoice_lines')
      .insert(linesToInsert);

    if (linesError) {
      this.logger.error(`Failed to insert sales lines: ${linesError.message}`);
    }

    return this.findOne(companyId, invoice.id);
  }

  /**
   * Confirms a draft sales invoice with atomic stock availability check.
   * If ANY item is short, rejects with 400 and writes ZERO ledger entries.
   */
  async confirm(companyId: string, invoiceId: string): Promise<SalesInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const invoice = await this.findOne(companyId, invoiceId);

    if (invoice.status === 'confirmed') {
      throw new BadRequestException('Sales invoice is already confirmed.');
    }

    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Cannot confirm a cancelled sales invoice.');
    }

    if (!invoice.lines || invoice.lines.length === 0) {
      throw new BadRequestException('Cannot confirm sales invoice without line items.');
    }

    // 1. Group required quantities by item_id
    const requiredByItem: Record<string, number> = {};
    for (const line of invoice.lines) {
      requiredByItem[line.item_id] = (requiredByItem[line.item_id] || 0) + line.quantity;
    }

    const itemIds = Object.keys(requiredByItem);

    // 2. Fetch all movements for these items to calculate current stock atomically
    const { data: movements, error: movError } = await admin
      .from('stock_ledger')
      .select('item_id, movement_type, quantity')
      .eq('company_id', companyId)
      .in('item_id', itemIds);

    if (movError) {
      this.logger.error(`Error querying stock ledger for confirmation: ${movError.message}`);
      throw new InternalServerErrorException('Failed to verify inventory levels.');
    }

    const movementsByItem: Record<string, { movement_type: string; quantity: any }[]> = {};
    for (const mov of movements || []) {
      if (!movementsByItem[mov.item_id]) movementsByItem[mov.item_id] = [];
      movementsByItem[mov.item_id].push(mov);
    }

    // 3. Check for stock shortages across all lines
    const shortages: {
      item_id: string;
      item_name: string;
      sku?: string | null;
      unit: string;
      available_stock: number;
      required_quantity: number;
      shortage: number;
    }[] = [];

    for (const line of invoice.lines) {
      const itemId = line.item_id;
      const currentStock = this.calculateItemStock(movementsByItem[itemId] || []);
      const requiredQty = requiredByItem[itemId];

      if (currentStock < requiredQty) {
        // Prevent duplicate shortage item reports if repeated in lines
        if (!shortages.some((s) => s.item_id === itemId)) {
          shortages.push({
            item_id: itemId,
            item_name: line.item?.name || 'Unknown Item',
            sku: line.item?.sku,
            unit: line.item?.unit || 'pcs',
            available_stock: currentStock,
            required_quantity: requiredQty,
            shortage: Math.round((requiredQty - currentStock) * 100) / 100,
          });
        }
      }
    }

    // 4. ATOMIC GUARD: If any shortage exists, reject with 400 and write 0 ledger entries
    if (shortages.length > 0) {
      const detailStr = shortages
        .map(
          (s) =>
            `'${s.item_name}' (Available: ${s.available_stock} ${s.unit}, Required: ${s.required_quantity} ${s.unit}, Shortage: ${s.shortage} ${s.unit})`,
        )
        .join(', ');

      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Cannot confirm sales invoice due to insufficient stock for ${shortages.length} item(s): ${detailStr}`,
        shortages,
      });
    }

    // 5. Stock is sufficient: Write sale_out entries to stock_ledger
    const ledgerEntries = invoice.lines.map((l) => ({
      company_id: companyId,
      item_id: l.item_id,
      movement_type: 'sale_out',
      quantity: l.quantity,
      reference_type: 'sales_invoice',
      reference_id: invoice.id,
    }));

    const { error: ledgerInsertError } = await admin
      .from('stock_ledger')
      .insert(ledgerEntries);

    if (ledgerInsertError) {
      this.logger.error(`Failed to record stock deductions: ${ledgerInsertError.message}`);
      throw new InternalServerErrorException('Failed to record inventory sales movement.');
    }

    // 6. Transition invoice status to 'confirmed'
    const { error: updateError } = await admin
      .from('sales_invoices')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', invoice.id);

    if (updateError) {
      this.logger.error(`Failed to update sales invoice status: ${updateError.message}`);
      throw new InternalServerErrorException('Failed to complete invoice confirmation.');
    }

    return this.findOne(companyId, invoiceId);
  }

  /**
   * Cancels a draft sales invoice. Confirmed invoices cannot be cancelled.
   */
  async cancel(companyId: string, invoiceId: string): Promise<SalesInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const invoice = await this.findOne(companyId, invoiceId);

    if (invoice.status === 'confirmed') {
      throw new BadRequestException(
        "Cannot cancel a 'confirmed' sales invoice. Only draft invoices can be cancelled.",
      );
    }

    if (invoice.status === 'cancelled') {
      return invoice;
    }

    const { error } = await admin
      .from('sales_invoices')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', invoiceId);

    if (error) {
      this.logger.error(`Failed to cancel sales invoice: ${error.message}`);
      throw new InternalServerErrorException('Failed to cancel sales invoice.');
    }

    return this.findOne(companyId, invoiceId);
  }

  /**
   * Lists all sales invoices with tax breakdown.
   */
  async findAll(companyId: string): Promise<SalesInvoice[]> {
    const admin = this.supabaseService.getAdminClient();

    // Fetch company state
    const { data: company } = await admin
      .from('companies')
      .select('address, gst_number')
      .eq('id', companyId)
      .maybeSingle();

    const compState = resolveState(company);

    const { data: invoices, error } = await admin
      .from('sales_invoices')
      .select(`
        *,
        parties:party_id ( id, name, phone, address, gst_number )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error querying sales invoices: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch sales invoices.');
    }

    return (invoices || []).map((inv: any) => {
      const partyState = resolveState(inv.parties);
      const isInterstate = Boolean(compState && partyState && compState !== partyState);

      const totalGst = Number(inv.gst_amount) || 0;
      const totalAmount = Number(inv.total_amount) || 0;
      const totalTaxable = Math.round((totalAmount - totalGst) * 100) / 100;

      const cgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
      const sgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
      const igst = isInterstate ? totalGst : 0;

      return {
        id: inv.id,
        company_id: inv.company_id,
        party_id: inv.party_id,
        party: {
          ...inv.parties,
          state: partyState,
        },
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        total_taxable_amount: totalTaxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        gst_amount: totalGst,
        total_amount: totalAmount,
        walkin_name: inv.walkin_name || null,
        walkin_phone: inv.walkin_phone || null,
        walkin_address: inv.walkin_address || null,
        is_interstate: isInterstate,
        status: inv.status,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
      };
    });
  }

  /**
   * Retrieves single sales invoice with lines and tax breakdown.
   */
  async findOne(companyId: string, invoiceId: string): Promise<SalesInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const { data: inv, error } = await admin
      .from('sales_invoices')
      .select(`
        *,
        parties:party_id ( id, name, phone, address, gst_number )
      `)
      .eq('company_id', companyId)
      .eq('id', invoiceId)
      .maybeSingle();

    if (error || !inv) {
      throw new NotFoundException(
        `Sales invoice '${invoiceId}' not found in this company.`,
      );
    }

    // Fetch company state
    const { data: company } = await admin
      .from('companies')
      .select('address, gst_number')
      .eq('id', companyId)
      .maybeSingle();

    const compState = resolveState(company);
    const partyState = resolveState(inv.parties);
    const isInterstate = Boolean(compState && partyState && compState !== partyState);

    // Fetch lines
    const { data: lines } = await admin
      .from('sales_invoice_lines')
      .select(`
        *,
        items:item_id ( id, name, sku, unit )
      `)
      .eq('sales_invoice_id', invoiceId);

    const formattedLines: SalesInvoiceLine[] = (lines || []).map((l: any) => {
      const qty = Number(l.quantity);
      const rate = Number(l.rate);
      const gstRate = Number(l.gst_rate);
      const lineTotal = Number(l.line_total);
      const taxable = Math.round(qty * rate * 100) / 100;
      const lineGst = Math.round((lineTotal - taxable) * 100) / 100;

      const cgst = isInterstate ? 0 : Math.round((lineGst / 2) * 100) / 100;
      const sgst = isInterstate ? 0 : Math.round((lineGst / 2) * 100) / 100;
      const igst = isInterstate ? lineGst : 0;

      return {
        id: l.id,
        sales_invoice_id: l.sales_invoice_id,
        item_id: l.item_id,
        item: l.items,
        quantity: qty,
        rate: rate,
        gst_rate: gstRate,
        taxable_amount: taxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        line_total: lineTotal,
      };
    });

    const totalGst = Number(inv.gst_amount) || 0;
    const totalAmount = Number(inv.total_amount) || 0;
    const totalTaxable = Math.round((totalAmount - totalGst) * 100) / 100;

    const cgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
    const sgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
    const igst = isInterstate ? totalGst : 0;

    return {
      id: inv.id,
      company_id: inv.company_id,
      party_id: inv.party_id,
      party: inv.parties,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_taxable_amount: totalTaxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      gst_amount: totalGst,
      total_amount: totalAmount,
      walkin_name: inv.walkin_name || null,
      walkin_phone: inv.walkin_phone || null,
      walkin_address: inv.walkin_address || null,
      is_interstate: isInterstate,
      status: inv.status,
      lines: formattedLines,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
    };
  }
}
