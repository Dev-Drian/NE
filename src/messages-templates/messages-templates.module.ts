import { Module } from '@nestjs/common';
import { MessagesTemplatesService } from './messages-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MessagesTemplatesService],
  exports: [MessagesTemplatesService],
})
export class MessagesTemplatesModule {}



