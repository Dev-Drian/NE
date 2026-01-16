import { Injectable } from '@nestjs/common';
import { IntentionsService } from '../../intentions/intentions.service';
import { DetectionResult } from '../dto/detection-result.dto';

@Injectable()
export class Layer2SimilarityService {
  constructor(private intentionsService: IntentionsService) {}

  async detect(message: string, companyId: string): Promise<DetectionResult> {
    const intentions = await this.intentionsService.findByCompany(companyId);
    const lowerMessage = message.toLowerCase().trim();

    let bestMatch: DetectionResult | null = null;
    let bestSimilarity = 0;

    for (const intention of intentions) {
      for (const example of intention.examples) {
        const similarity = this.calculateSimilarity(lowerMessage, example.text.toLowerCase().trim());

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = {
            intention: intention.name,
            confidence: similarity,
          };
        }
      }
    }

    if (bestMatch && bestSimilarity >= 0.6) {
      return bestMatch;
    }

    return {
      intention: 'otro',
      confidence: 0,
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Algoritmo de similitud basado en Levenshtein normalizado
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}




