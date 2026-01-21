import { Module } from '@nestjs/common';
import { IntentionsService } from './intentions.service';
import { IntentionsController } from './intentions.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IntentionsController],
  providers: [IntentionsService],
  exports: [IntentionsService],
})
export class IntentionsModule {}





