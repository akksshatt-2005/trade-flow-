import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePurchaseDto } from './dto/purchases.dto';

export interface PurchaseInvoiceLine {
  id: string;
  purchase_invoice_id: string;
  item_id: string;
  item?: { id: string; name: string; sku?: string | null; unit: string };
  quantity: number;
  rate: number;
  gst_rate: number;
  line_total: number;
}

export interface PurchaseInvoice {
  id: string;
  company_id: string;
  party_id: string;
  party?: { id: string; name: string; phone?: string | null; gst_number?: string | null };
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  walkin_name?: string | null;
  walkin_phone?: string | null;
  walkin_address?: string | null;
  status: 'draft' | 'confirmed' | 'cancelled';
  lines?: PurchaseInvoiceLine[];
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Creates a draft purchase invoice with lines.
   */
  async create(companyId: string, dto: CreatePurchaseDto): Promise<PurchaseInvoice> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Verify party exists and is vendor, both, or system Cash account
    const { data: party, error: partyError } = await admin
      .from('parties')
      .select('id, name, type, is_system_account')
      .eq('company_id', companyId)
      .eq('id', dto.party_id)
      .maybeSingle();

    if (partyError || !party) {
      throw new BadRequestException('Selected vendor does not exist in this company.');
    }

    const isSystemCash = Boolean(party.is_system_account) || party.name.toLowerCase() === 'cash';
    if (party.type !== 'vendor' && party.type !== 'both' && !isSystemCash) {
      throw new BadRequestException(
        `Selected party '${party.name}' has type '${party.type}'. Purchase invoices can only be created for vendors.`,
      );
    }

    // 2. Check invoice_number uniqueness for this company
    const { data: existingInv } = await admin
      .from('purchase_invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('invoice_number', dto.invoice_number.trim())
      .maybeSingle();

    if (existingInv) {
      throw new ConflictException(
        `Purchase invoice with number '${dto.invoice_number}' already exists in this company.`,
      );
    }

    // 3. Verify all items exist in this company & calculate lines
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

    // 4. Insert purchase_invoices header (status: 'draft')
    const { data: invoice, error: invoiceError } = await admin
      .from('purchase_invoices')
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
          `Purchase invoice with number '${dto.invoice_number}' already exists in this company.`,
        );
      }
      this.logger.error(`Failed to insert purchase invoice: ${invoiceError?.message}`);
      throw new InternalServerErrorException('Failed to create purchase invoice.');
    }

    // 5. Insert line items
    const linesToInsert = computedLines.map((l) => ({
      purchase_invoice_id: invoice.id,
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      gst_rate: l.gst_rate,
      line_total: l.line_total,
    }));

    const { error: linesError } = await admin
      .from('purchase_invoice_lines')
      .insert(linesToInsert);

    if (linesError) {
      this.logger.error(`Failed to insert purchase lines: ${linesError.message}`);
    }

    return this.findOne(companyId, invoice.id);
  }

  /**
   * Confirms a draft purchase invoice and writes purchase_in entries to stock_ledger.
   */
  async confirm(companyId: string, invoiceId: string): Promise<PurchaseInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const invoice = await this.findOne(companyId, invoiceId);

    if (invoice.status === 'confirmed') {
      throw new BadRequestException('Purchase invoice is already confirmed.');
    }

    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Cannot confirm a cancelled purchase invoice.');
    }

    if (!invoice.lines || invoice.lines.length === 0) {
      throw new BadRequestException('Cannot confirm purchase invoice without line items.');
    }

    // 1. Write purchase_in entries to stock_ledger
    const ledgerEntries = invoice.lines.map((l) => ({
      company_id: companyId,
      item_id: l.item_id,
      movement_type: 'purchase_in',
      quantity: l.quantity,
      reference_type: 'purchase_invoice',
      reference_id: invoice.id,
    }));

    const { error: ledgerError } = await admin
      .from('stock_ledger')
      .insert(ledgerEntries);

    if (ledgerError) {
      this.logger.error(`Failed to write purchase stock movements: ${ledgerError.message}`);
      throw new InternalServerErrorException('Failed to record stock inward movements.');
    }

    // 2. Transition invoice status to 'confirmed'
    const { error: updateError } = await admin
      .from('purchase_invoices')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', invoice.id);

    if (updateError) {
      this.logger.error(`Failed to update purchase invoice status: ${updateError.message}`);
      throw new InternalServerErrorException('Failed to update invoice confirmation status.');
    }

    return this.findOne(companyId, invoiceId);
  }

  /**
   * Cancels a draft purchase invoice. Confirmed invoices cannot be cancelled.
   */
  async cancel(companyId: string, invoiceId: string): Promise<PurchaseInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const invoice = await this.findOne(companyId, invoiceId);

    if (invoice.status === 'confirmed') {
      throw new BadRequestException(
        "Cannot cancel a 'confirmed' purchase invoice. Only draft invoices can be cancelled.",
      );
    }

    if (invoice.status === 'cancelled') {
      return invoice;
    }

    const { error } = await admin
      .from('purchase_invoices')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', invoiceId);

    if (error) {
      this.logger.error(`Failed to cancel purchase invoice: ${error.message}`);
      throw new InternalServerErrorException('Failed to cancel purchase invoice.');
    }

    return this.findOne(companyId, invoiceId);
  }

  /**
   * Lists all purchase invoices for the company.
   */
  async findAll(companyId: string): Promise<PurchaseInvoice[]> {
    const admin = this.supabaseService.getAdminClient();

    const { data: invoices, error } = await admin
      .from('purchase_invoices')
      .select(`
        *,
        parties:party_id ( id, name, phone, gst_number )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error querying purchase invoices: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch purchase invoices.');
    }

    return (invoices || []).map((inv: any) => ({
      id: inv.id,
      company_id: inv.company_id,
      party_id: inv.party_id,
      party: inv.parties,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: Number(inv.total_amount),
      gst_amount: Number(inv.gst_amount),
      walkin_name: inv.walkin_name || null,
      walkin_phone: inv.walkin_phone || null,
      walkin_address: inv.walkin_address || null,
      status: inv.status,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
    }));
  }

  /**
   * Retrieves single purchase invoice with line items.
   */
  async findOne(companyId: string, invoiceId: string): Promise<PurchaseInvoice> {
    const admin = this.supabaseService.getAdminClient();

    const { data: inv, error } = await admin
      .from('purchase_invoices')
      .select(`
        *,
        parties:party_id ( id, name, phone, gst_number )
      `)
      .eq('company_id', companyId)
      .eq('id', invoiceId)
      .maybeSingle();

    if (error || !inv) {
      throw new NotFoundException(
        `Purchase invoice '${invoiceId}' not found in this company.`,
      );
    }

    // Fetch lines
    const { data: lines } = await admin
      .from('purchase_invoice_lines')
      .select(`
        *,
        items:item_id ( id, name, sku, unit )
      `)
      .eq('purchase_invoice_id', invoiceId);

    return {
      id: inv.id,
      company_id: inv.company_id,
      party_id: inv.party_id,
      party: inv.parties,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: Number(inv.total_amount),
      gst_amount: Number(inv.gst_amount),
      walkin_name: inv.walkin_name || null,
      walkin_phone: inv.walkin_phone || null,
      walkin_address: inv.walkin_address || null,
      status: inv.status,
      lines: (lines || []).map((l: any) => ({
        id: l.id,
        purchase_invoice_id: l.purchase_invoice_id,
        item_id: l.item_id,
        item: l.items,
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        gst_rate: Number(l.gst_rate),
        line_total: Number(l.line_total),
      })),
      created_at: inv.created_at,
      updated_at: inv.updated_at,
    };
  }
}
