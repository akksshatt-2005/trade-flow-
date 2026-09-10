import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CompanyScopeGuard } from './guards/company-scope.guard';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyScopeGuard],
  exports: [CompaniesService, CompanyScopeGuard],
})
export class CompaniesModule {}
