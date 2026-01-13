import { Injectable } from '@nestjs/common';
import { IntentionsService } from '../../intentions/intentions.service';
import { DetectionResult } from '../dto/detection-result.dto';

@Injectable()
export class Layer1KeywordsService {
  constructor(private intentionsService: IntentionsService) {}

  async detect(message: string, companyId: string): Promise<DetectionResult> {
    const lowerMessage = message.toLowerCase();
    const intentions = await this.intentionsService.findByCompany(companyId);

    let bestMatch: DetectionResult | null = null;
    let bestConfidence = 0;

    for (const intention of intentions) {
      let totalWeight = 0;
      let matchesCount = 0;

      for (const pattern of intention.patterns) {
        if (pattern.type === 'keyword') {
          const keyword = pattern.value.toLowerCase();
          if (lowerMessage.includes(keyword)) {
            totalWeight += pattern.weight;
            matchesCount++;
          }
        }
      }

      if (matchesCount > 0) {
        // Calcular confidence: promedio de weights, con bonus por cantidad de matches
        const avgWeight = totalWeight / matchesCount;
        const bonus = Math.min(matchesCount * 0.1, 0.2); // Bonus máximo de 0.2
        const confidence = Math.min(avgWeight + bonus, 1.0);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = {
            intention: intention.name,
            confidence,
          };
        }
      }
    }

    if (bestMatch && bestConfidence >= 0.5) {
      return bestMatch;
    }

    return {
      intention: 'otro',
      confidence: 0,
    };
  }
}

