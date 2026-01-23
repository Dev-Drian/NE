import { Injectable } from '@nestjs/common';
import { TextUtilsService } from './text-utils.service';

/**
 * Definiciones de keywords comunes para diferentes tipos de intenciones
 * Estos deberían eventualmente moverse a la base de datos para mayor flexibilidad
 */
const KEYWORD_CATEGORIES = {
  greeting: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi', 'buen día'],
  farewell: ['gracias', 'listo gracias', 'perfecto gracias', 'ok gracias', 'vale gracias', 'adiós', 'adios', 'chao', 'hasta luego', 'nos vemos', 'bye'],
  products: ['menu', 'productos', 'que tienen', 'opciones', 'carta', 'que hay', 'que venden', 'que ofrecen', 'servicios', 'tratamientos', 'que servicios', 'cuales servicios'],
  paraLlevar: ['para llevar', 'pedir para llevar', 'llevar', 'take away', 'recoger', 'pasar a recoger'],
  consulta: [
    'horario', 'horarios', 'abren', 'cierran', 'atencion', 'que dias', 
    'cual es el horario', 'cuando abren', 'direccion', 'ubicacion', 'donde estan',
    'tienen disponibilidad', 'hay disponibilidad', 'disponible', 'que tienen',
    'que servicios', 'que productos', 'cuales servicios', 'cuales productos'
  ],
  price: [
    'cuanto cuesta', 'precio de', 'precio del', 'cuanto vale', 'costo de', 'costo del',
    'cuanto sale', 'precio', 'vale', 'cuesta'
  ],
  reservar: ['reservar', 'reserva', 'cita', 'agendar', 'quiero', 'necesito', 'deseo'],
  cancelar: [
    'cancelar', 'cancelar mi reserva', 'cancelar reserva', 'cancelar cita', 
    'cancelar pedido', 'anular', 'anular reserva', 'anular cita', 'anular pedido',
    'anular mi reserva', 'necesito anular', 'quiero anular', 'deseo anular',
    'eliminar', 'eliminar reserva', 'eliminar cita', 'eliminar pedido',
    'borrar', 'borrar reserva', 'no quiero', 'no necesito', 'deseo cancelar',
    'quiero cancelar', 'necesito cancelar', 'mejor cancelar', 'cancelar por favor'
  ],
  payment: ['pago', 'pagar', 'apague', 'apagar', 'pagado', 'pagaste', 'pagamos', 'pague', 'pague ya', 'ya pague', 'falta pagar', 'debo pagar', 'link de pago', 'link pago', 'pago pendiente', 'pago falta'],
  history: ['mis pedidos', 'mis domicilios', 'mis reservas', 'mis citas', 'cuantos pedidos', 'cuantos domicilios', 'cuantas reservas', 'historial', 'pedidos anteriores', 'que he pedido', 'pedidos previos', 'mis ordenes', 'cuantos llevo', 'cuantas llevo', 'ultimos pedidos', 'ultimas reservas'],
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
   * Detecta si el mensaje es una despedida o agradecimiento
   */
  isFarewell(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.farewell);
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
   * Detecta si el mensaje pregunta si tienen servicio de domicilio (consulta informativa)
   */
  asksAboutDelivery(message: string): boolean {
    const deliveryKeywords = ['domicilio', 'delivery', 'domicilios'];
    const questionWords = ['hacen', 'tienen', 'hay', 'ofrecen', 'manejan', 'existe', 'cuentan con', 'también', 'tambien'];
    const hasDeliveryKeyword = this.textUtils.containsAnyKeyword(message, deliveryKeywords);
    const isQuestion = this.textUtils.containsAnyKeyword(message, questionWords);
    return hasDeliveryKeyword && isQuestion;
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con delivery
   * Excluye preguntas informativas ("hacen domicilios?", "tienen delivery?")
   */
  mentionsDelivery(message: string): boolean {
    // Si es una pregunta sobre disponibilidad, NO es orden
    if (this.asksAboutDelivery(message)) {
      return false;
    }
    
    const deliveryKeywords = ['domicilio', 'delivery', 'llevar a casa', 'enviar a', 'envio', 'traigan', 'lleven', 'a casa', 'que me lo traigan'];
    return this.textUtils.containsAnyKeyword(message, deliveryKeywords);
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con pago
   */
  mentionsPayment(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.payment);
  }

  /**
   * Detecta si el usuario afirma que ya pagó
   */
  saysAlreadyPaid(message: string): boolean {
    const paidKeywords = [
      'ya pague', 'ya pagué', 'ya page', 'ya pago', 'ya pagó', 
      'pague ya', 'pagué ya', 'acabo de pagar', 'acabo de page', 
      'ya realice el pago', 'ya realicé el pago', 'ya hice el pago', 
      'listo pague', 'listo pagué', 'listo ya pague', 'listo ya pagué',
      'realice el pago', 'realicé el pago', 'hice el pago',
      'complete el pago', 'completé el pago', 'efectue el pago', 'efectué el pago'
    ];
    return this.textUtils.containsAnyKeyword(message, paidKeywords);
  }

  /**
   * Detecta si el usuario pregunta por su historial de pedidos/reservas
   */
  asksForHistory(message: string): boolean {
    return this.textUtils.containsAnyKeyword(message, KEYWORD_CATEGORIES.history);
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

