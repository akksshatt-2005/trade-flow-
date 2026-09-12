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
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gst_number?: string | null;
  pan?: string | null;
  drug_license_number?: string | null;
  drug_license_expiry?: string | null;
  opening_balance?: number;
  opening_balance_type?: 'dr' | 'cr';
  is_system_account?: boolean;
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

const META_TAG_REGEX = /<!--META:({[\s\S]*?})-->/;

export function serializePartyAddress(dto: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  email?: string | null;
  pan?: string | null;
  drug_license_number?: string | null;
  drug_license_expiry?: string | null;
  opening_balance?: number | null;
  opening_balance_type?: 'dr' | 'cr' | null;
}): string | null {
  const meta: Record<string, any> = {};
  if (dto.email && dto.email.trim()) meta.email = dto.email.trim();
  if (dto.city && dto.city.trim()) meta.city = dto.city.trim();
  if (dto.state && dto.state.trim()) meta.state = dto.state.trim();
  if (dto.pincode && dto.pincode.trim()) meta.pincode = dto.pincode.trim();
  if (dto.pan && dto.pan.trim()) meta.pan = dto.pan.trim().toUpperCase();
  if (dto.drug_license_number && dto.drug_license_number.trim()) {
    meta.drug_license_number = dto.drug_license_number.trim();
  }
  if (dto.drug_license_expiry && dto.drug_license_expiry.trim()) {
    meta.drug_license_expiry = dto.drug_license_expiry.trim();
  }
  if (dto.opening_balance !== undefined && dto.opening_balance !== null) {
    meta.opening_balance = Number(dto.opening_balance) || 0;
  }
  if (dto.opening_balance_type) meta.opening_balance_type = dto.opening_balance_type;

  let baseAddr = (dto.address || '').replace(META_TAG_REGEX, '').trim();

  const parts: string[] = [];
  if (baseAddr) parts.push(baseAddr);
  if (dto.city && dto.city.trim() && !baseAddr.toLowerCase().includes(dto.city.trim().toLowerCase())) {
    parts.push(dto.city.trim());
  }
  if (dto.state && dto.state.trim() && !baseAddr.toLowerCase().includes(dto.state.trim().toLowerCase())) {
    parts.push(dto.state.trim());
  }
  if (dto.pincode && dto.pincode.trim() && !baseAddr.includes(dto.pincode.trim())) {
    parts.push(dto.pincode.trim());
  }

  const cleanAddress = parts.join(', ');

  if (Object.keys(meta).length > 0) {
    return cleanAddress
      ? `${cleanAddress}\n<!--META:${JSON.stringify(meta)}-->`
      : `<!--META:${JSON.stringify(meta)}-->`;
  }
  return cleanAddress || null;
}

export function formatParty(raw: any): Party {
  if (!raw) return raw;

  let email = raw.email || null;
  let city = raw.city || null;
  let state = raw.state || null;
  let pincode = raw.pincode || null;
  let pan = raw.pan || null;
  let dlNumber = raw.drug_license_number || null;
  let dlExpiry = raw.drug_license_expiry || null;
  let openingBalance =
    raw.opening_balance !== undefined && raw.opening_balance !== null
      ? Number(raw.opening_balance)
      : 0;
  let openingBalanceType: 'dr' | 'cr' = raw.opening_balance_type === 'dr' ? 'dr' : 'cr';

  let cleanAddress = raw.address || null;

  if (cleanAddress && typeof cleanAddress === 'string') {
    const match = cleanAddress.match(META_TAG_REGEX);
    if (match && match[1]) {
      try {
        const meta = JSON.parse(match[1]);
        if (!email && meta.email) email = meta.email;
        if (!city && meta.city) city = meta.city;
        if (!state && meta.state) state = meta.state;
        if (!pincode && meta.pincode) pincode = meta.pincode;
        if (!pan && meta.pan) pan = meta.pan;
        if (!dlNumber && meta.drug_license_number) dlNumber = meta.drug_license_number;
        if (!dlExpiry && meta.drug_license_expiry) dlExpiry = meta.drug_license_expiry;
        if (openingBalance === 0 && meta.opening_balance !== undefined) {
          openingBalance = Number(meta.opening_balance);
        }
        if (meta.opening_balance_type) openingBalanceType = meta.opening_balance_type;
      } catch {}
      cleanAddress = cleanAddress.replace(META_TAG_REGEX, '').trim() || null;
    }
  }

  if (!state) {
    state = resolveState(raw);
  }

  return {
    id: raw.id,
    company_id: raw.company_id,
    name: raw.name,
    type: raw.type,
    phone: raw.phone || null,
    email: email,
    address: cleanAddress,
    city: city,
    state: state,
    pincode: pincode,
    gst_number: raw.gst_number || null,
    pan: pan,
    drug_license_number: dlNumber,
    drug_license_expiry: dlExpiry,
    opening_balance: openingBalance,
    opening_balance_type: openingBalanceType,
    is_system_account: Boolean(raw.is_system_account || raw.name?.toLowerCase() === 'cash'),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

@Injectable()
export class PartiesService {
  private readonly logger = new Logger(PartiesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Creates a party scoped to the active tenant with compliance and financial metadata.
   */
  async create(companyId: string, dto: CreatePartyDto): Promise<Party> {
    const admin = this.supabaseService.getAdminClient();

    const finalAddress = serializePartyAddress({
      address: dto.address,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode,
      email: dto.email,
      pan: dto.pan,
      drug_license_number: dto.drug_license_number,
      drug_license_expiry: dto.drug_license_expiry,
      opening_balance: dto.opening_balance,
      opening_balance_type: dto.opening_balance_type,
    });

    const insertPayload: any = {
      company_id: companyId,
      name: dto.name.trim(),
      type: dto.type,
      phone: dto.phone?.trim() || null,
      address: finalAddress,
      gst_number: dto.gst_number?.trim() || null,
      email: dto.email?.trim() || null,
      city: dto.city?.trim() || null,
      state: dto.state?.trim() || null,
      pincode: dto.pincode?.trim() || null,
      pan: dto.pan?.trim()?.toUpperCase() || null,
      drug_license_number: dto.drug_license_number?.trim() || null,
      drug_license_expiry: dto.drug_license_expiry?.trim() || null,
      opening_balance: dto.opening_balance !== undefined ? Number(dto.opening_balance) : 0,
      opening_balance_type: dto.opening_balance_type || 'cr',
    };

    let { data: party, error } = await admin
      .from('parties')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    // If direct columns fail due to schema cache differences, strip unmigrated columns and insert
    if (error && error.message?.includes('column')) {
      const basicPayload = {
        company_id: companyId,
        name: dto.name.trim(),
        type: dto.type,
        phone: dto.phone?.trim() || null,
        address: finalAddress,
        gst_number: dto.gst_number?.trim() || null,
      };

      const retry = await admin
        .from('parties')
        .insert(basicPayload)
        .select()
        .single();

      party = retry.data;
      error = retry.error;
    }

    if (error || !party) {
      this.logger.error(`Failed to create party: ${error?.message}`);
      throw new InternalServerErrorException(
        error?.message || 'Failed to create party record.',
      );
    }

    return formatParty(party);
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

    return (parties || []).map(formatParty);
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

    return formatParty(party);
  }

  /**
   * Updates party details.
   * Blocks type-change if invoices exist for this party.
   * Blocks modification of name, type, or system status on system Cash accounts.
   */
  async update(
    companyId: string,
    partyId: string,
    dto: UpdatePartyDto,
  ): Promise<Party> {
    const currentParty = await this.findOne(companyId, partyId);
    const admin = this.supabaseService.getAdminClient();

    // Guard: System Cash account immutability
    if (currentParty.is_system_account || currentParty.name.toLowerCase() === 'cash') {
      if (dto.name && dto.name.trim().toLowerCase() !== currentParty.name.toLowerCase()) {
        throw new BadRequestException('Cannot change the name of the system Cash account.');
      }
      if (dto.type && dto.type !== currentParty.type) {
        throw new BadRequestException('Cannot change the party type of the system Cash account.');
      }
    }

    // Guard: Check if type change is attempted when invoices exist
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

    // Merge updated values with existing
    const mergedDto = {
      address: dto.address !== undefined ? dto.address : currentParty.address,
      city: dto.city !== undefined ? dto.city : currentParty.city,
      state: dto.state !== undefined ? dto.state : currentParty.state,
      pincode: dto.pincode !== undefined ? dto.pincode : currentParty.pincode,
      email: dto.email !== undefined ? dto.email : currentParty.email,
      pan: dto.pan !== undefined ? dto.pan : currentParty.pan,
      drug_license_number:
        dto.drug_license_number !== undefined
          ? dto.drug_license_number
          : currentParty.drug_license_number,
      drug_license_expiry:
        dto.drug_license_expiry !== undefined
          ? dto.drug_license_expiry
          : currentParty.drug_license_expiry,
      opening_balance:
        dto.opening_balance !== undefined ? dto.opening_balance : currentParty.opening_balance,
      opening_balance_type:
        dto.opening_balance_type !== undefined
          ? dto.opening_balance_type
          : currentParty.opening_balance_type,
    };

    const finalAddress = serializePartyAddress(mergedDto);

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.type !== undefined) updatePayload.type = dto.type;
    if (dto.phone !== undefined) updatePayload.phone = dto.phone?.trim() || null;
    if (dto.gst_number !== undefined) updatePayload.gst_number = dto.gst_number?.trim() || null;
    updatePayload.address = finalAddress;

    // Optional direct columns
    if (dto.email !== undefined) updatePayload.email = dto.email?.trim() || null;
    if (dto.city !== undefined) updatePayload.city = dto.city?.trim() || null;
    if (dto.state !== undefined) updatePayload.state = dto.state?.trim() || null;
    if (dto.pincode !== undefined) updatePayload.pincode = dto.pincode?.trim() || null;
    if (dto.pan !== undefined) updatePayload.pan = dto.pan?.trim()?.toUpperCase() || null;
    if (dto.drug_license_number !== undefined) {
      updatePayload.drug_license_number = dto.drug_license_number?.trim() || null;
    }
    if (dto.drug_license_expiry !== undefined) {
      updatePayload.drug_license_expiry = dto.drug_license_expiry?.trim() || null;
    }
    if (dto.opening_balance !== undefined) {
      updatePayload.opening_balance = Number(dto.opening_balance);
    }
    if (dto.opening_balance_type !== undefined) {
      updatePayload.opening_balance_type = dto.opening_balance_type;
    }

    let { data: updated, error } = await admin
      .from('parties')
      .update(updatePayload)
      .eq('company_id', companyId)
      .eq('id', partyId)
      .select()
      .maybeSingle();

    if (error && error.message?.includes('column')) {
      const basicPayload: any = {
        updated_at: new Date().toISOString(),
        address: finalAddress,
      };
      if (dto.name !== undefined) basicPayload.name = dto.name.trim();
      if (dto.type !== undefined) basicPayload.type = dto.type;
      if (dto.phone !== undefined) basicPayload.phone = dto.phone?.trim() || null;
      if (dto.gst_number !== undefined) basicPayload.gst_number = dto.gst_number?.trim() || null;

      const retry = await admin
        .from('parties')
        .update(basicPayload)
        .eq('company_id', companyId)
        .eq('id', partyId)
        .select()
        .single();

      updated = retry.data;
      error = retry.error;
    }

    if (error || !updated) {
      this.logger.error(`Failed to update party: ${error?.message}`);
      throw new InternalServerErrorException('Failed to update party details.');
    }

    return formatParty(updated);
  }

  /**
   * Deletes a party if not a system account and no linked invoices exist.
   */
  async delete(companyId: string, partyId: string): Promise<{ success: boolean; message: string }> {
    const party = await this.findOne(companyId, partyId);
    if (party.is_system_account || party.name.toLowerCase() === 'cash') {
      throw new BadRequestException('Cannot delete system Cash account.');
    }

    const admin = this.supabaseService.getAdminClient();

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
      throw new BadRequestException('Cannot delete party with existing invoice history.');
    }

    const { error } = await admin
      .from('parties')
      .delete()
      .eq('company_id', companyId)
      .eq('id', partyId);

    if (error) {
      throw new InternalServerErrorException('Failed to delete party.');
    }

    return { success: true, message: 'Party deleted successfully.' };
  }

  /**
   * Computes lightweight summary of invoices and balances for this party.
   */
  async getSummary(companyId: string, partyId: string): Promise<PartySummary> {
    const party = await this.findOne(companyId, partyId);
    const admin = this.supabaseService.getAdminClient();

    const { data: salesInvoices, error: salesError } = await admin
      .from('sales_invoices')
      .select('total_amount')
      .eq('company_id', companyId)
      .eq('party_id', partyId);

    if (salesError) {
      this.logger.warn(`Failed to fetch sales invoices for summary: ${salesError.message}`);
    }

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
