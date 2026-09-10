import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly adminClient: SupabaseClient;
  private readonly anonClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ||
      process.env.SUPABASE_URL ||
      '';
    const serviceRoleKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '';
    const anonKey =
      this.configService.get<string>('SUPABASE_ANON_KEY') ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    if (!supabaseUrl || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined.',
      );
    }

    this.adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.anonClient = createClient(supabaseUrl, anonKey);
  }

  /**
   * Internal mapping helper: formats username to a non-public internal email.
   * e.g., "demo_user" -> "demo_user@internal.tradeflow.local"
   */
  public toInternalEmail(username: string): string {
    const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return `${sanitized}@internal.tradeflow.local`;
  }

  /**
   * Returns the Supabase Admin client with Service Role privileges.
   */
  public getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Returns the public Supabase Client (uses Anon key for client auth sign-in).
   */
  public getAnonClient(): SupabaseClient {
    return this.anonClient;
  }
}
