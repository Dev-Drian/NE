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
  };
  missingFields?: string[];
  suggestedReply?: string;
}




