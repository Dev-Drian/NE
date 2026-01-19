import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}




