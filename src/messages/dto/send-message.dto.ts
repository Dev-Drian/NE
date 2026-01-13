import { IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  companyId: string;

  @IsString()
  userId: string;

  @IsString()
  message: string;
}

