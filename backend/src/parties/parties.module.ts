import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { CompaniesModule } from '../companies/companies.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CompaniesModule, AuthModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
