import { Module } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}

