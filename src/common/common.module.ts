import { Module, Global } from '@nestjs/common';
import { ValidationService } from './validators/validation.service';

/**
 * Módulo global para servicios comunes compartidos
 */
@Global()
@Module({
  providers: [ValidationService],
  exports: [ValidationService],
})
export class CommonModule {}
