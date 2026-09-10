import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveState } from '../companies/companies.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/parties.dto';

export interface Party {
  id: string;
  company_id: string;
  name: string;
  type: 'customer' | 'vendor' | 'both';
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  gst_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartySummary {
  party: Party;
  sales_invoices_count: number;
  purchase_invoices_count: number;
  total_sales_amount: number;
  total_purchase_amount: number;
  outstanding_balance: number;
}

@Injectable()
export class PartiesService {
  private readonly logger = new Logger(PartiesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Creates a party (customer/vendor/both) scoped to the active tenant.
   */
  async create(companyId: string, dto: CreatePartyDto): Promise<Party> {
    const admin = this.supabaseService.getAdminClient();

    let finalAddress = dto.address?.trim() || null;
    if (dto.state && dto.state.trim()) {
      const stateTrimmed = dto.state.trim();
      if (!finalAddress) {
        finalAddress = stateTrimmed;
      } else if (!finalAddress.toLowerCase().includes(stateTrimmed.toLowerCase())) {
        finalAddress = `${finalAddress}, ${stateTrimmed}`;
      }
    }

    const { data: party, error } = await admin
      .from('parties')
      .insert({
        company_id: companyId,
        name: dto.name.trim(),
        type: dto.type,
        phone: dto.phone?.trim() || null,
        address: finalAddress,
        gst_number: dto.gst_number?.trim() || null,
      })
      .select()
      .single();

    if (error || !party) {
      this.logger.error(`Failed to create party: ${error?.message}`);
      throw new InternalServerErrorException(
        error?.message || 'Failed to create party record.',
      );
    }

    return {
      ...party,
      state: dto.state || resolveState(party),
    };
  }

  /**
   * Lists all parties for a company with optional type filtering.
   */
  async findAll(companyId: string, filterType?: string): Promise<Party[]> {
    const admin = this.supabaseService.getAdminClient();

    let query = admin
      .from('parties')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (filterType) {
      const lower = filterType.trim().toLowerCase();
      if (lower === 'customer') {
        query = query.in('type', ['customer', 'both']);
      } else if (lower === 'vendor') {
        query = query.in('type', ['vendor', 'both']);
      } else if (lower === 'both') {
        query = query.eq('type', 'both');
      }
    }

    const { data: parties, error } = await query;

    if (error) {
      this.logger.error(`Error querying parties: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch parties list.');
    }

    return (parties || []).map((p) => ({
      ...p,
      state: resolveState(p),
    }));
  }

  /**
   * Retrieves single party details.
   */
  async findOne(companyId: string, partyId: string): Promise<Party> {
    const admin = this.supabaseService.getAdminClient();

    const { data: party, error } = await admin
      .from('parties')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', partyId)
      .maybeSingle();

    if (error || !party) {
      throw new NotFoundException(`Party '${partyId}' not found in this company.`);
    }

    return {
      ...party,
      state: resolveState(party),
    };
  }

  /**
   * Updates party details.
   * Blocks type-change if invoices exist for this party.
   */
  async update(
    companyId: string,
    partyId: string,
    dto: UpdatePartyDto,
  ): Promise<Party> {
    const currentParty = await this.findOne(companyId, partyId);
    const admin = this.supabaseService.getAdminClient();

    // Guard: Check if type change is attempted
    if (dto.type && dto.type !== currentParty.type) {
      const { count: salesCount } = await admin
        .from('sales_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('party_id', partyId);

      const { count: purchaseCount } = await admin
        .from('purchase_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('party_id', partyId);

      if ((salesCount || 0) > 0 || (purchaseCount || 0) > 0) {
        throw new BadRequestException(
          'Cannot change party type because invoices already exist for this party.',
        );
      }
    }

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.type !== undefined) updatePayload.type = dto.type;
    if (dto.phone !== undefined) updatePayload.phone = dto.phone?.trim() || null;
    if (dto.address !== undefined) updatePayload.address = dto.address?.trim() || null;
    if (dto.gst_number !== undefined) updatePayload.gst_number = dto.gst_number?.trim() || null;

    const { data: updated, error } = await admin
      .from('parties')
      .update(updatePayload)
      .eq('company_id', companyId)
      .eq('id', partyId)
      .select()
      .single();

    if (error || !updated) {
      this.logger.error(`Failed to update party: ${error?.message}`);
      throw new InternalServerErrorException('Failed to update party details.');
    }

    return updated;
  }

  /**
   * Computes lightweight summary of invoices and balances for this party.
   */
  async getSummary(companyId: string, partyId: string): Promise<PartySummary> {
    const party = await this.findOne(companyId, partyId);
    const admin = this.supabaseService.getAdminClient();

    // Sales invoices aggregate
    const { data: salesInvoices, error: salesError } = await admin
      .from('sales_invoices')
      .select('total_amount')
      .eq('company_id', companyId)
      .eq('party_id', partyId);

    if (salesError) {
      this.logger.warn(`Failed to fetch sales invoices for summary: ${salesError.message}`);
    }

    // Purchase invoices aggregate
    const { data: purchaseInvoices, error: purchaseError } = await admin
      .from('purchase_invoices')
      .select('total_amount')
      .eq('company_id', companyId)
      .eq('party_id', partyId);

    if (purchaseError) {
      this.logger.warn(
        `Failed to fetch purchase invoices for summary: ${purchaseError.message}`,
      );
    }

    const salesCount = (salesInvoices || []).length;
    const totalSales = (salesInvoices || []).reduce(
      (sum, inv) => sum + (Number(inv.total_amount) || 0),
      0,
    );

    const purchaseCount = (purchaseInvoices || []).length;
    const totalPurchases = (purchaseInvoices || []).reduce(
      (sum, inv) => sum + (Number(inv.total_amount) || 0),
      0,
    );

    return {
      party,
      sales_invoices_count: salesCount,
      purchase_invoices_count: purchaseCount,
      total_sales_amount: Math.round(totalSales * 100) / 100,
      total_purchase_amount: Math.round(totalPurchases * 100) / 100,
      outstanding_balance: 0.0,
    };
  }
}
