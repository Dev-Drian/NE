import { IsString, IsUUID, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  companyId: string;

  // userId es opcional - si no se proporciona, se creará automáticamente
  @IsString()
  @IsOptional()
  userId?: string;

  // phone es opcional - se puede extraer del mensaje o proporcionar explícitamente
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  message: string;
}


