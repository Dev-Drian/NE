export class ProcessMessageDto {
  companyId: string;
  userId: string; // Será asignado automáticamente
  phone?: string; // Teléfono proporcionado o extraído
  message: string;
}


