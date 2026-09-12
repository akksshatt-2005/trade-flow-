import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [SupabaseModule, CompaniesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
