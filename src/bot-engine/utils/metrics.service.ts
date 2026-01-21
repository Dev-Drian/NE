import { Injectable, Logger } from '@nestjs/common';

interface LayerMetrics {
  calls: number;
  totalTime: number;
  errors: number;
  avgTime: number;
}

interface Metrics {
  layer1: LayerMetrics;
  layer2: LayerMetrics;
  layer3: LayerMetrics;
  totalMessages: number;
  totalErrors: number;
}

/**
 * Servicio de métricas básicas para monitoreo del bot engine
 * Rastrea llamadas, tiempos y errores por capa de detección
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private metrics: Metrics = {
    layer1: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
    layer2: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
    layer3: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
    totalMessages: 0,
    totalErrors: 0,
  };

  /**
   * Registra una llamada a una capa con su tiempo de ejecución
   */
  recordLayerCall(
    layer: 'layer1' | 'layer2' | 'layer3',
    executionTime: number,
    success: boolean = true,
  ): void {
    const layerMetrics = this.metrics[layer];
    layerMetrics.calls++;
    layerMetrics.totalTime += executionTime;
    layerMetrics.avgTime = layerMetrics.totalTime / layerMetrics.calls;

    if (!success) {
      layerMetrics.errors++;
      this.metrics.totalErrors++;
    }
  }

  /**
   * Registra un mensaje procesado
   */
  recordMessage(): void {
    this.metrics.totalMessages++;
  }

  /**
   * Registra un error general
   */
  recordError(): void {
    this.metrics.totalErrors++;
  }

  /**
   * Obtiene las métricas actuales
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Obtiene un resumen de métricas legible
   */
  getSummary(): string {
    const m = this.metrics;
    return `
Bot Engine Metrics Summary:
- Total Messages: ${m.totalMessages}
- Total Errors: ${m.totalErrors}
- Error Rate: ${m.totalMessages > 0 ? ((m.totalErrors / m.totalMessages) * 100).toFixed(2) : 0}%

Layer 1 (Keywords):
  - Calls: ${m.layer1.calls}
  - Avg Time: ${m.layer1.avgTime.toFixed(2)}ms
  - Errors: ${m.layer1.errors}

Layer 2 (Similarity):
  - Calls: ${m.layer2.calls}
  - Avg Time: ${m.layer2.avgTime.toFixed(2)}ms
  - Errors: ${m.layer2.errors}

Layer 3 (OpenAI):
  - Calls: ${m.layer3.calls}
  - Avg Time: ${m.layer3.avgTime.toFixed(2)}ms
  - Errors: ${m.layer3.errors}
    `.trim();
  }

  /**
   * Resetea todas las métricas
   */
  reset(): void {
    this.metrics = {
      layer1: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
      layer2: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
      layer3: { calls: 0, totalTime: 0, errors: 0, avgTime: 0 },
      totalMessages: 0,
      totalErrors: 0,
    };
    this.logger.log('Metrics reset');
  }

  /**
   * Log de métricas periódico (puede ser llamado desde un cron job)
   */
  logMetrics(): void {
    this.logger.log(this.getSummary());
  }
}
