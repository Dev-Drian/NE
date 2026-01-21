import { Injectable } from '@nestjs/common';

/**
 * Servicio de utilidades para procesamiento de texto
 * Centraliza funciones comunes como normalización, detección de keywords, etc.
 */
@Injectable()
export class TextUtilsService {
  /**
   * Normaliza texto eliminando acentos y convirtiendo a minúsculas
   * Útil para comparaciones sin considerar acentos
   */
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Verifica si el mensaje contiene alguna de las keywords proporcionadas
   * @param message Mensaje a verificar
   * @param keywords Array de keywords a buscar
   * @returns true si alguna keyword está presente
   */
  containsAnyKeyword(message: string, keywords: string[]): boolean {
    const normalized = this.normalizeText(message);
    return keywords.some(keyword => 
      normalized.includes(this.normalizeText(keyword))
    );
  }

  /**
   * Encuentra la primera keyword que coincide en el mensaje
   * @param message Mensaje a verificar
   * @param keywords Array de keywords a buscar
   * @returns La keyword encontrada o null
   */
  findMatchingKeyword(message: string, keywords: string[]): string | null {
    const normalized = this.normalizeText(message);
    for (const keyword of keywords) {
      if (normalized.includes(this.normalizeText(keyword))) {
        return keyword;
      }
    }
    return null;
  }

  /**
   * Extrae palabras clave relevantes del mensaje
   * Útil para análisis rápido de intención
   */
  extractKeywords(message: string, keywordLists: Record<string, string[]>): string[] {
    const normalized = this.normalizeText(message);
    const foundKeywords: string[] = [];

    for (const [category, keywords] of Object.entries(keywordLists)) {
      for (const keyword of keywords) {
        if (normalized.includes(this.normalizeText(keyword))) {
          foundKeywords.push(`${category}:${keyword}`);
        }
      }
    }

    return foundKeywords;
  }
}

