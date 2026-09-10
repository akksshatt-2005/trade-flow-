import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    username: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly rateLimitService: AuthRateLimitService,
  ) {}

  /**
   * Registers a new user via Supabase Auth using a synthetic internal email.
   * Mirrors identity into public.users without storing password_hash.
   */
  public async signup(dto: SignupDto): Promise<AuthResponse> {
    const normalizedUsername = dto.username.trim().toLowerCase();
    const internalEmail = this.supabaseService.toInternalEmail(normalizedUsername);
    const admin = this.supabaseService.getAdminClient();

    // 1. Verify username is not taken in public.users
    const { data: existingUser, error: checkError } = await admin
      .from('users')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (checkError) {
      this.logger.error(`Error querying public.users: ${checkError.message}`);
    }

    if (existingUser) {
      throw new ConflictException(`Username '${dto.username}' is already taken.`);
    }

    // 2. Create user in Supabase Auth (auth.users)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: dto.password,
      email_confirm: true,
      user_metadata: { username: normalizedUsername },
    });

    if (authError || !authData.user) {
      this.logger.error(`Supabase Auth admin createUser failed: ${authError?.message}`);
      if (authError?.message?.includes('already registered')) {
        throw new ConflictException(`Username '${dto.username}' is already taken.`);
      }
      throw new BadRequestException(
        authError?.message || 'Failed to create user account.',
      );
    }

    const userId = authData.user.id;

    // 3. Insert public user profile (PASSWORD HASH IS EXCLUDED)
    const { error: insertProfileError } = await admin.from('users').insert({
      id: userId,
      username: normalizedUsername,
    });

    if (insertProfileError) {
      this.logger.error(
        `Failed to insert user profile in public.users: ${insertProfileError.message}`,
      );
      // Cleanup orphan auth user if profile insertion failed
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // Ignore cleanup failure
      }
      throw new InternalServerErrorException(
        'Failed to finalize user profile initialization.',
      );
    }

    // 4. Issue active session tokens for the new user
    const anon = this.supabaseService.getAnonClient();
    const { data: loginData, error: loginError } =
      await anon.auth.signInWithPassword({
        email: internalEmail,
        password: dto.password,
      });

    if (loginError || !loginData.session) {
      this.logger.warn(
        `Auto-login after signup failed: ${loginError?.message}. Falling back to admin generated token.`,
      );
      return {
        access_token: '',
        user: {
          id: userId,
          username: normalizedUsername,
        },
      };
    }

    return {
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      user: {
        id: userId,
        username: normalizedUsername,
      },
    };
  }

  /**
   * Authenticates a user with username & password against Supabase Auth.
   * Protected with failed attempt rate-limiting.
   */
  public async login(dto: LoginDto): Promise<AuthResponse> {
    const normalizedUsername = dto.username.trim().toLowerCase();

    // 1. Enforce brute-force protection
    this.rateLimitService.checkLimit(normalizedUsername);

    const internalEmail = this.supabaseService.toInternalEmail(normalizedUsername);
    const anon = this.supabaseService.getAnonClient();

    // 2. Authenticate with Supabase Auth
    const { data, error } = await anon.auth.signInWithPassword({
      email: internalEmail,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.rateLimitService.recordFailure(normalizedUsername);
      throw new UnauthorizedException('Invalid username or password.');
    }

    // 3. Reset failed login attempts on successful sign in
    this.rateLimitService.recordSuccess(normalizedUsername);

    // 4. Retrieve public profile record
    const admin = this.supabaseService.getAdminClient();
    const { data: profile } = await admin
      .from('users')
      .select('id, username')
      .eq('id', data.user.id)
      .maybeSingle();

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        username: profile?.username || normalizedUsername,
      },
    };
  }
}
