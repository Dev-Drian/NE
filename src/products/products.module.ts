import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
