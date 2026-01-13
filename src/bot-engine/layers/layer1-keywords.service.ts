import { Injectable } from '@nestjs/common';
import { IntentionsService } from '../../intentions/intentions.service';
import { DetectionResult } from '../dto/detection-result.dto';

@Injectable()
export class Layer1KeywordsService {
  constructor(private intentionsService: IntentionsService) {}

  async detect(message: string, companyId: string): Promise<DetectionResult> {
    const lowerMessage = message.toLowerCase();
    const intentions = await this.intentionsService.findByCompany(companyId);

    const detectedIntentions: Array<{ intention: string; confidence: number; priority: number }> = [];

    for (const intention of intentions) {
      let totalWeight = 0;
      let matchesCount = 0;

      for (const pattern of intention.patterns) {
        if (pattern.type === 'keyword') {
          const keyword = pattern.value.toLowerCase();
          // Usar word boundary para evitar matches parciales (ej: "reserva" dentro de "cancelar mi reserva")
          // Pero también permitir matches simples para flexibilidad
          const keywordRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (keywordRegex.test(lowerMessage)) {
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

        detectedIntentions.push({
          intention: intention.name,
          confidence,
          priority: intention.priority,
        });
      }
    }

    if (detectedIntentions.length === 0) {
      return {
        intention: 'otro',
        confidence: 0,
      };
    }

    // Ordenar por prioridad (mayor primero), luego por confidence
    detectedIntentions.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Mayor prioridad primero
      }
      return b.confidence - a.confidence; // Mayor confianza primero
    });

    const bestMatch = detectedIntentions[0];

    // Si hay múltiples intenciones detectadas, priorizar acciones específicas sobre genéricas
    if (detectedIntentions.length > 1) {
      const actionPriority = ['cancelar', 'reservar', 'consultar', 'saludar'];
      
      // Buscar la intención con mayor prioridad de acción
      for (const action of actionPriority) {
        const actionMatch = detectedIntentions.find(d => d.intention === action);
        if (actionMatch) {
          return {
            intention: actionMatch.intention,
            confidence: actionMatch.confidence,
          };
        }
      }
    }

    if (bestMatch.confidence >= 0.5) {
      return {
        intention: bestMatch.intention,
        confidence: bestMatch.confidence,
      };
    }

    return {
      intention: 'otro',
      confidence: 0,
    };
  }
}

