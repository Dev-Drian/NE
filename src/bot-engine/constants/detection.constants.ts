/**
 * Constantes para thresholds de confianza en detección de intenciones
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.6,
  LOW: 0.5,
};

/**
 * TTL (Time To Live) para cache en milisegundos
 */
export const CACHE_TTL = {
  CONTEXT: 5000, // 5 segundos
  COMPANY: 5 * 60 * 1000, // 5 minutos
};
