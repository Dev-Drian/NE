import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { CompaniesModule } from '../companies/companies.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [CompaniesModule, ReservationsModule],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}




