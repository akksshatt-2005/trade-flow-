import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompanyDto } from './dto/create-company.dto';

export interface CompanyWithRole {
  id: string;
  name: string;
  gst_number?: string | null;
  address?: string | null;
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
        role: row.role,
        created_at: row.companies.created_at,
      }));
  }

  /**
   * Creates a new company tenant and links the creator as 'owner' in user_companies.
   */
  async create(userId: string, dto: CreateCompanyDto): Promise<CompanyWithRole> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Create company record
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({
        name: dto.name.trim(),
        gst_number: dto.gst_number?.trim() || null,
        address: dto.address?.trim() || null,
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
