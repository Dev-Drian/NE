import { Module } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
