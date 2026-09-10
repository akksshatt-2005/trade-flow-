import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authentication token required.');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Expected: Bearer <token>',
      );
    }

    const admin = this.supabaseService.getAdminClient();
    const { data: authData, error: authError } =
      await admin.auth.getUser(token);

    if (authError || !authData?.user) {
      throw new UnauthorizedException(
        authError?.message || 'Invalid or expired session token.',
      );
    }

    // Fetch matching user from public.users
    const { data: profile } = await admin
      .from('users')
      .select('id, username')
      .eq('id', authData.user.id)
      .maybeSingle();

    const authenticatedUser: AuthenticatedUser = {
      id: authData.user.id,
      username:
        profile?.username ||
        authData.user.user_metadata?.username ||
        authData.user.email?.split('@')[0] ||
        'user',
      email: authData.user.email,
    };

    req.user = authenticatedUser;
    return true;
  }
}
