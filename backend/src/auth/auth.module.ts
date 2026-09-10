import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, SupabaseAuthGuard],
  exports: [AuthService, SupabaseAuthGuard, AuthRateLimitService],
})
export class AuthModule {}
