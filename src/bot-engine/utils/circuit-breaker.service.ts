import { Injectable, Logger } from '@nestjs/common';

/**
 * Estados del circuit breaker
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker para proteger servicios externos (como OpenAI)
 * Implementa el patrón Circuit Breaker para evitar llamadas a servicios que están fallando
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private successCount = 0;

  // Configuración
  private readonly FAILURE_THRESHOLD = 5; // Abrir después de 5 fallos consecutivos
  private readonly SUCCESS_THRESHOLD = 2; // Cerrar después de 2 éxitos consecutivos en half-open
  private readonly TIMEOUT = 60000; // 60 segundos antes de intentar half-open

  /**
   * Ejecuta una operación protegida por circuit breaker
   * @param operation Función a ejecutar
   * @param fallback Función de fallback si el circuit breaker está abierto o la operación falla
   * @returns Resultado de la operación o del fallback
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    // Si el circuit breaker está abierto, verificar si debemos intentar half-open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.logger.log('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        this.logger.warn('Circuit breaker is OPEN, using fallback');
        if (fallback) {
          return fallback();
        }
        throw new Error('Circuit breaker is OPEN and no fallback provided');
      }
    }

    try {
      const result = await operation();
      
      // Si tuvimos éxito, registrar éxito
      this.onSuccess();
      return result;
    } catch (error) {
      // Si falló, registrar fallo
      this.onFailure();
      
      // Si hay fallback, usarlo
      if (fallback) {
        this.logger.warn(`Operation failed, using fallback: ${error.message}`);
        return fallback();
      }
      
      // Si no hay fallback, lanzar el error
      throw error;
    }
  }

  /**
   * Registra un éxito en la operación
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.SUCCESS_THRESHOLD) {
        this.state = CircuitState.CLOSED;
        this.logger.log('Circuit breaker CLOSED - service recovered');
      }
    }
  }

  /**
   * Registra un fallo en la operación
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      // Si fallamos en half-open, volver a abierto inmediatamente
      this.state = CircuitState.OPEN;
      this.logger.warn('Circuit breaker OPENED - service still failing');
    } else if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.state = CircuitState.OPEN;
      this.logger.error(
        `Circuit breaker OPENED after ${this.failureCount} consecutive failures`,
      );
    }
  }

  /**
   * Determina si debemos intentar resetear el circuit breaker (half-open)
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.TIMEOUT;
  }

  /**
   * Obtiene el estado actual del circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Obtiene estadísticas del circuit breaker
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.state === CircuitState.OPEN,
    };
  }

  /**
   * Resetea el circuit breaker manualmente (útil para testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logger.log('Circuit breaker manually reset');
  }
}
