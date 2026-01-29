export interface DetectionResult {
  intention: string;
  confidence: number;
  extractedData?: {
    date?: string;
    time?: string;
    guests?: number;
    phone?: string;
    name?: string;
    service?: string;
    address?: string; // Dirección/ubicación para domicilio
    products?: Array<{ id: string; quantity: number }>;
    tableId?: string; // Mesa específica si se menciona
    queryType?: string; // Tipo de consulta (ej: 'availability', 'price', etc.)
  };
  missingFields?: string[];
  suggestedReply?: string;
}




