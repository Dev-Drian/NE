export interface DetectionResult {
  intention: string;
  confidence: number;
  extractedData?: {
    // Campos en español (estándar principal)
    fecha?: string;
    hora?: string;
    personas?: number;
    telefono?: string;
    nombre?: string;
    servicio?: string;
    direccion?: string; // Dirección/ubicación para domicilio
    productos?: Array<{ id: string; quantity: number }>;
    mesa?: string; // Mesa específica si se menciona
    notas?: string; // Notas o comentarios adicionales
    // Campos legacy en inglés (para compatibilidad)
    date?: string;
    time?: string;
    guests?: number;
    phone?: string;
    name?: string;
    service?: string;
    address?: string;
    products?: Array<{ id: string; quantity: number }>;
    tableId?: string;
    notes?: string;
    // Campos de consulta
    queryType?: string; // Tipo de consulta (ej: 'availability', 'price', etc.)
    // Campos adicionales para enriquecimiento
    email?: string; // Email del cliente
    amount?: number; // Monto de dinero
    duration?: number; // Duración en minutos
    [key: string]: any; // Permitir campos dinámicos para futuras extensiones
  };
  missingFields?: string[];
  suggestedReply?: string;
}
