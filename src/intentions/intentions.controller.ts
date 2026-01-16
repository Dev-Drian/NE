import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { IntentionsService } from './intentions.service';
import { Intention, Prisma } from '@prisma/client';

@Controller('intentions')
export class IntentionsController {
  constructor(private readonly intentionsService: IntentionsService) {}

  @Post()
  create(@Body() createIntentionDto: Prisma.IntentionCreateInput) {
    return this.intentionsService.create(createIntentionDto);
  }

  @Get()
  findAll(@Query('companyId') companyId: string) {
    if (companyId) {
      return this.intentionsService.findByCompany(companyId);
    }
    return [];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.intentionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIntentionDto: Prisma.IntentionUpdateInput) {
    return this.intentionsService.update(id, updateIntentionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.intentionsService.remove(id);
  }
}




