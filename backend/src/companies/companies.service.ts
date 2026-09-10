import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';

const GST_STATE_CODES: Record<string, string> = {
  '01': 'jammu and kashmir',
  '02': 'himachal pradesh',
  '03': 'punjab',
  '04': 'chandigarh',
  '05': 'uttarakhand',
  '06': 'haryana',
  '07': 'delhi',
  '08': 'rajasthan',
  '09': 'uttar pradesh',
  '10': 'bihar',
  '11': 'sikkim',
  '12': 'arunachal pradesh',
  '13': 'nagaland',
  '14': 'manipur',
  '15': 'mizoram',
  '16': 'tripura',
  '17': 'meghalaya',
  '18': 'assam',
  '19': 'west bengal',
  '20': 'jharkhand',
  '21': 'odisha',
  '22': 'chhattisgarh',
  '23': 'madhya pradesh',
  '24': 'gujarat',
  '27': 'maharashtra',
  '29': 'karnataka',
  '30': 'goa',
  '32': 'kerala',
  '33': 'tamil nadu',
  '36': 'telangana',
  '37': 'andhra pradesh',
};

const KNOWN_STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
  'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh',
  'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab',
  'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand',
  'west bengal', 'delhi', 'chandigarh', 'jammu & kashmir', 'ladakh', 'puducherry',
];

export function resolveState(entity?: { gst_number?: string | null; address?: string | null; state?: string | null } | null): string {
  if (!entity) return '';
  if (entity.state && entity.state.trim()) {
    return entity.state.trim().toLowerCase();
  }
  if (entity.gst_number && entity.gst_number.trim().length >= 2) {
    const code = entity.gst_number.trim().substring(0, 2);
    if (GST_STATE_CODES[code]) {
      return GST_STATE_CODES[code];
    }
  }
  if (entity.address && entity.address.trim()) {
    const addrLower = entity.address.trim().toLowerCase();
    for (const st of KNOWN_STATES) {
      if (addrLower.includes(st)) {
        return st;
      }
    }
    return addrLower;
  }
  return '';
}

export interface CompanyWithRole {
  id: string;
  name: string;
  gst_number?: string | null;
  address?: string | null;
  state?: string | null;
  role: 'owner' | 'accountant' | 'salesperson';
  created_at: string;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Retrieves all companies associated with a specific user via user_companies.
   */
  async getMine(userId: string): Promise<CompanyWithRole[]> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('user_companies')
      .select(`
        role,
        created_at,
        companies:company_id (
          id,
          name,
          gst_number,
          address,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Error querying user_companies: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to fetch user associated companies.',
      );
    }

    if (!data) return [];

    return data
      .filter((row) => row.companies !== null)
      .map((row: any) => ({
        id: row.companies.id,
        name: row.companies.name,
        gst_number: row.companies.gst_number,
        address: row.companies.address,
        state: resolveState(row.companies),
        role: row.role,
        created_at: row.companies.created_at,
      }));
  }

  /**
   * Creates a new company tenant and links the creator as 'owner' in user_companies.
   */
  async create(userId: string, dto: CreateCompanyDto): Promise<CompanyWithRole> {
    const admin = this.supabaseService.getAdminClient();

    // Ensure address captures state if provided
    let finalAddress = dto.address?.trim() || null;
    if (dto.state && dto.state.trim()) {
      const stateTrimmed = dto.state.trim();
      if (!finalAddress) {
        finalAddress = stateTrimmed;
      } else if (!finalAddress.toLowerCase().includes(stateTrimmed.toLowerCase())) {
        finalAddress = `${finalAddress}, ${stateTrimmed}`;
      }
    }

    // 1. Create company record
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({
        name: dto.name.trim(),
        gst_number: dto.gst_number?.trim() || null,
        address: finalAddress,
      })
      .select()
      .single();

    if (companyError || !company) {
      this.logger.error(`Failed to insert company: ${companyError?.message}`);
      throw new InternalServerErrorException('Failed to create company record.');
    }

    // 2. Assign creator as 'owner' in user_companies
    const { error: linkError } = await admin.from('user_companies').insert({
      user_id: userId,
      company_id: company.id,
      role: 'owner',
    });

    if (linkError) {
      this.logger.error(
        `Failed to link user to company in user_companies: ${linkError.message}`,
      );
      // Cleanup orphan company record
      try {
        await admin.from('companies').delete().eq('id', company.id);
      } catch {
        // Ignore cleanup failure
      }
      throw new InternalServerErrorException(
        'Failed to assign owner permissions to new company.',
      );
    }

    return {
      id: company.id,
      name: company.name,
      gst_number: company.gst_number,
      address: company.address,
      state: dto.state || resolveState(company),
      role: 'owner',
      created_at: company.created_at,
    };
  }

  /**
   * Verifies if a user has access to a specific company ID.
   */
  async verifyUserCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<{ hasAccess: boolean; role?: string; company?: any }> {
    const admin = this.supabaseService.getAdminClient();

    const { data, error } = await admin
      .from('user_companies')
      .select(`
        role,
        companies:company_id (
          id,
          name,
          gst_number,
          address
        )
      `)
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !data) {
      return { hasAccess: false };
    }

    return {
      hasAccess: true,
      role: data.role,
      company: data.companies,
    };
  }
}
