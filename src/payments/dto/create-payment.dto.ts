import { IsString, IsNumber, IsEmail, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  companyId: string;

  @IsString()
  conversationId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEmail()
  customerEmail: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  description: string;
}
