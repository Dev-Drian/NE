import { Injectable } from '@nestjs/common';
import { TextUtilsService } from './text-utils.service';

/**
 * Definiciones de keywords comunes para diferentes tipos de intenciones
 * Estos deberían eventualmente moverse a la base de datos para mayor flexibilidad
 */
const KEYWORD_CATEGORIES = {
  greeting: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi', 'buen día'],
  products: ['menu', 'productos', 'que tienen', 'opciones', 'carta', 'que hay', 'que venden', 'que ofrecen', 'servicios', 'tratamientos', 'que servicios', 'cuales servicios'],
  paraLlevar: ['para llevar', 'pedir para llevar', 'llevar', 'take away', 'recoger', 'pasar a recoger'],
  consulta: ['horario', 'horarios', 'abren', 'cierran', 'atencion', 'que dias', 'cual es el horario', 'cuando abren', 'direccion', 'ubicacion', 'donde estan'],
  price: ['cuanto cuesta', 'precio de', 'precio del', 'cuanto vale', 'costo de', 'costo del'],
  reservar: ['reservar', 'reserva', 'cita', 'agendar', 'quiero', 'necesito', 'deseo'],
  cancelar: ['cancelar', 'cancelar mi reserva', 'cancelar reserva'],
  payment: ['pago', 'pagar', 'apague', 'apagar', 'pagado', 'pagaste', 'pagamos', 'pague', 'pague ya', 'ya pague', 'falta pagar', 'debo pagar', 'link de pago', 'link pago', 'pago pendiente', 'pago falta'],
};

/**
 * Servicio centralizado para detectar keywords y patrones comunes
 * Evita duplicación de lógica de detección en múltiples lugares
 */
@Injectable()
export class KeywordDetectorService {
  constructor(private textUtils: TextUtilsService) {}

  /**
   * Detecta si el mensaje es un saludo
   */
  isGreeting(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.greeting);
  }

  /**
   * Detecta si el mensaje pregunta por productos/menú/servicios
   */
  asksForProducts(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.products);
  }

  /**
   * Detecta si el mensaje menciona "para llevar"
   */
  asksParaLlevar(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.paraLlevar);
  }

  /**
   * Detecta si el mensaje tiene keywords de consulta (horarios, dirección, etc.)
   */
  hasConsultaKeywords(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.consulta);
  }

  /**
   * Detecta si el mensaje pregunta por precios
   */
  asksForPrice(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.price);
  }

  /**
   * Detecta si el mensaje menciona intención de reservar
   */
  mentionsReservation(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.reservar);
  }

  /**
   * Detecta si el mensaje menciona cancelar
   */
  mentionsCancel(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.cancelar);
  }

  /**
   * Detecta si el usuario no quiere domicilio
   * Ej: "no quiero que me lo traigan", "no quiero domicilio"
   */
  doesNotWantDelivery(message: string): boolean {
    const normalized = this.textUtils.normalizeText(message);
    const noQuieroKeywords = ['no quiero', 'no necesito', 'no quiero que'];
    const deliveryKeywords = ['traigan', 'lleven', 'domicilio', 'delivery'];

    const hasNoQuiero = noQuieroKeywords.some(k => normalized.includes(k));
    const hasDelivery = deliveryKeywords.some(k => normalized.includes(k));

    return hasNoQuiero && hasDelivery;
  }

  /**
   * Detecta si el mensaje menciona productos de comida
   * Útil para inferir servicio "domicilio"
   */
  mentionsFood(message: string): boolean {
    const foodKeywords = ['pizza', 'pasta', 'lasagna', 'coca', 'bebida', 'postre', 'comida', 'almuerzo', 'cena'];
    return this.textUtils.containsAnyKeyword(message, foodKeywords);
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con delivery
   */
  mentionsDelivery(message: string): boolean {
    const deliveryKeywords = ['domicilio', 'delivery', 'llevar a casa', 'enviar a', 'pedido'];
    return this.textUtils.containsAnyKeyword(message, deliveryKeywords);
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con pago
   */
  mentionsPayment(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.payment);
  }

  /**
   * Obtiene todas las categorías detectadas en el mensaje
   */
  detectAllCategories(message: string): string[] {
    const categories: string[] = [];
    
    if (this.isGreeting(message)) categories.push('greeting');
    if (this.asksForProducts(message)) categories.push('products');
    if (this.asksParaLlevar(message)) categories.push('paraLlevar');
    if (this.hasConsultaKeywords(message)) categories.push('consulta');
    if (this.asksForPrice(message)) categories.push('price');
    if (this.mentionsReservation(message)) categories.push('reservar');
    if (this.mentionsCancel(message)) categories.push('cancelar');
    if (this.mentionsPayment(message)) categories.push('payment');
    
    return categories;
  }
}

