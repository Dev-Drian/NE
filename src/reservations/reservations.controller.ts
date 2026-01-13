import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { Reservation, Prisma } from '@prisma/client';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() createReservationDto: Prisma.ReservationCreateInput) {
    return this.reservationsService.create(createReservationDto);
  }

  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.reservationsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReservationDto: Prisma.ReservationUpdateInput) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reservationsService.update(id, { status: 'cancelled' });
  }
}

