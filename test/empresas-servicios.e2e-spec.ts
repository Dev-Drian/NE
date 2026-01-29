import { TestHelper } from './helpers/test-helper';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  empresa: string;
  empresaId: string;
  tipo: string;
  servicio: string;
  servicioNombre: string;
  pasos: Array<{
    numero: number;
    mensaje: string;
    respuesta: {
      status: number;
      intention: string;
      confidence: number;
      conversationState: string;
      missingFields?: string[];
      reply: string;
    };
    timestamp: string;
  }>;
  resultadoFinal: {
    estado: string;
    exito: boolean;
    errores?: string[];
  };
  duracion: number;
}

describe('Tests por Empresa y Servicio', () => {
  let testHelper: TestHelper;
  let ids: {
    restaurantId: string;
    clinicId: string;
    userId1: string;
    userId2: string;
    userId3: string;
  };
  const resultados: TestResult[] = [];

  beforeAll(async () => {
    testHelper = new TestHelper();
    console.log('🔧 Iniciando setup...');
    await testHelper.setup();
    console.log('✅ Aplicación iniciada');
    
    await testHelper.clearDatabase();
    await testHelper.clearRedis();
    console.log('✅ BD y Redis limpiados');
    
    console.log('🌱 Ejecutando seed...');
    ids = await testHelper.seedDatabase();
    
    console.log('✅ Setup completado');
  }, 120000);

  afterAll(async () => {
    // Generar JSON con resultados
    const resultadosPath = path.join(process.cwd(), 'test-results.json');
    fs.writeFileSync(resultadosPath, JSON.stringify(resultados, null, 2), 'utf-8');
    console.log(`\n📄 Resultados guardados en: ${resultadosPath}`);
    console.log(`📊 Total de tests ejecutados: ${resultados.length}`);
    
    await testHelper.clearDatabase();
    await testHelper.clearRedis();
    await testHelper.teardown();
    console.log('✅ Limpieza completada');
  }, 30000);

  describe('Restaurante La Pasta', () => {
    it('Servicio: Mesa en restaurante', async () => {
      const inicio = Date.now();
      const pasos: TestResult['pasos'] = [];
      let errores: string[] = [];

      console.log('\n📋 EMPRESA: Restaurante La Pasta');
      console.log('🔹 SERVICIO: Mesa en restaurante');
      console.log('='.repeat(60));

      try {
        // Paso 1: Saludo
        const step1 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId1,
          'hola',
        );
        pasos.push({
          numero: 1,
          mensaje: 'hola',
          respuesta: {
            status: step1.status,
            intention: step1.body.intention,
            confidence: step1.body.confidence,
            conversationState: step1.body.conversationState,
            missingFields: step1.body.missingFields,
            reply: step1.body.reply,
          },
          timestamp: new Date().toISOString(),
        });
        console.log(`✅ Paso 1: Saludo - Intención: ${step1.body.intention}`);

        // Paso 2: Reservar mesa
        const step2 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId1,
          'quiero reservar una mesa para mañana a las 8pm',
        );
        pasos.push({
          numero: 2,
          mensaje: 'quiero reservar una mesa para mañana a las 8pm',
          respuesta: {
            status: step2.status,
            intention: step2.body.intention,
            confidence: step2.body.confidence,
            conversationState: step2.body.conversationState,
            missingFields: step2.body.missingFields,
            reply: step2.body.reply,
          },
          timestamp: new Date().toISOString(),
        });
        console.log(`✅ Paso 2: Reserva - Estado: ${step2.body.conversationState}`);

        // Paso 3: Completar datos
        const step3 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId1,
          'somos 4 personas y mi teléfono es 612345678',
        );
        pasos.push({
          numero: 3,
          mensaje: 'somos 4 personas y mi teléfono es 612345678',
          respuesta: {
            status: step3.status,
            intention: step3.body.intention,
            confidence: step3.body.confidence,
            conversationState: step3.body.conversationState,
            missingFields: step3.body.missingFields,
            reply: step3.body.reply,
          },
          timestamp: new Date().toISOString(),
        });
        console.log(`✅ Paso 3: Datos completados - Estado: ${step3.body.conversationState}`);

        const estadoFinal = step3.body.conversationState;
        const exito = ['collecting', 'completed', 'awaiting_payment'].includes(estadoFinal);

        resultados.push({
          empresa: 'Restaurante La Pasta',
          empresaId: ids.restaurantId,
          tipo: 'restaurant',
          servicio: 'mesa',
          servicioNombre: 'Mesa en restaurante',
          pasos,
          resultadoFinal: {
            estado: estadoFinal,
            exito,
            errores: exito ? undefined : [`Estado inesperado: ${estadoFinal}`],
          },
          duracion: Date.now() - inicio,
        });

        expect(exito).toBe(true);
      } catch (error: any) {
        errores.push(error.message);
        resultados.push({
          empresa: 'Restaurante La Pasta',
          empresaId: ids.restaurantId,
          tipo: 'restaurant',
          servicio: 'mesa',
          servicioNombre: 'Mesa en restaurante',
          pasos,
          resultadoFinal: {
            estado: 'error',
            exito: false,
            errores,
          },
          duracion: Date.now() - inicio,
        });
        throw error;
      }
    }, 60000);

    it('Servicio: Domicilio', async () => {
      const inicio = Date.now();
      const pasos: TestResult['pasos'] = [];
      let errores: string[] = [];

      // Limpiar contexto
      await testHelper.clearRedis();

      console.log('\n📋 EMPRESA: Restaurante La Pasta');
      console.log('🔹 SERVICIO: Servicio a domicilio');
      console.log('='.repeat(60));

      try {
        // Paso 1: Saludo
        const step1 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId2,
          'hola',
        );
        pasos.push({
          numero: 1,
          mensaje: 'hola',
          respuesta: {
            status: step1.status,
            intention: step1.body.intention,
            confidence: step1.body.confidence,
            conversationState: step1.body.conversationState,
            missingFields: step1.body.missingFields,
            reply: step1.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 2: Pedir domicilio
        const step2 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId2,
          'quiero un pedido a domicilio para hoy',
        );
        pasos.push({
          numero: 2,
          mensaje: 'quiero un pedido a domicilio para hoy',
          respuesta: {
            status: step2.status,
            intention: step2.body.intention,
            confidence: step2.body.confidence,
            conversationState: step2.body.conversationState,
            missingFields: step2.body.missingFields,
            reply: step2.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 3: Hora
        const step3 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId2,
          'para las 7 de la noche',
        );
        pasos.push({
          numero: 3,
          mensaje: 'para las 7 de la noche',
          respuesta: {
            status: step3.status,
            intention: step3.body.intention,
            confidence: step3.body.confidence,
            conversationState: step3.body.conversationState,
            missingFields: step3.body.missingFields,
            reply: step3.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 4: Productos
        const step4 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId2,
          'quiero una pizza margherita y una coca cola',
        );
        pasos.push({
          numero: 4,
          mensaje: 'quiero una pizza margherita y una coca cola',
          respuesta: {
            status: step4.status,
            intention: step4.body.intention,
            confidence: step4.body.confidence,
            conversationState: step4.body.conversationState,
            missingFields: step4.body.missingFields,
            reply: step4.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 5: Teléfono
        const step5 = await testHelper.sendMessage(
          ids.restaurantId,
          ids.userId2,
          'mi teléfono es 698765432',
        );
        pasos.push({
          numero: 5,
          mensaje: 'mi teléfono es 698765432',
          respuesta: {
            status: step5.status,
            intention: step5.body.intention,
            confidence: step5.body.confidence,
            conversationState: step5.body.conversationState,
            missingFields: step5.body.missingFields,
            reply: step5.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        const estadoFinal = step5.body.conversationState;
        const exito = ['collecting', 'completed', 'awaiting_payment'].includes(estadoFinal);

        resultados.push({
          empresa: 'Restaurante La Pasta',
          empresaId: ids.restaurantId,
          tipo: 'restaurant',
          servicio: 'domicilio',
          servicioNombre: 'Servicio a domicilio',
          pasos,
          resultadoFinal: {
            estado: estadoFinal,
            exito,
            errores: exito ? undefined : [`Estado inesperado: ${estadoFinal}`],
          },
          duracion: Date.now() - inicio,
        });

        expect(exito).toBe(true);
      } catch (error: any) {
        errores.push(error.message);
        resultados.push({
          empresa: 'Restaurante La Pasta',
          empresaId: ids.restaurantId,
          tipo: 'restaurant',
          servicio: 'domicilio',
          servicioNombre: 'Servicio a domicilio',
          pasos,
          resultadoFinal: {
            estado: 'error',
            exito: false,
            errores,
          },
          duracion: Date.now() - inicio,
        });
        throw error;
      }
    }, 60000);
  });

  describe('Clínica Dental Sonrisas', () => {
    it('Servicio: Cita en clínica', async () => {
      const inicio = Date.now();
      const pasos: TestResult['pasos'] = [];
      let errores: string[] = [];

      // Limpiar contexto
      await testHelper.clearRedis();

      console.log('\n📋 EMPRESA: Clínica Dental Sonrisas');
      console.log('🔹 SERVICIO: Cita en clínica');
      console.log('='.repeat(60));

      try {
        // Paso 1: Consulta
        const step1 = await testHelper.sendMessage(
          ids.clinicId,
          ids.userId3,
          'hola, qué servicios tienen?',
        );
        pasos.push({
          numero: 1,
          mensaje: 'hola, qué servicios tienen?',
          respuesta: {
            status: step1.status,
            intention: step1.body.intention,
            confidence: step1.body.confidence,
            conversationState: step1.body.conversationState,
            missingFields: step1.body.missingFields,
            reply: step1.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 2: Solicitar cita
        const step2 = await testHelper.sendMessage(
          ids.clinicId,
          ids.userId3,
          'quiero una cita para limpieza dental',
        );
        pasos.push({
          numero: 2,
          mensaje: 'quiero una cita para limpieza dental',
          respuesta: {
            status: step2.status,
            intention: step2.body.intention,
            confidence: step2.body.confidence,
            conversationState: step2.body.conversationState,
            missingFields: step2.body.missingFields,
            reply: step2.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 3: Fecha y hora
        const step3 = await testHelper.sendMessage(
          ids.clinicId,
          ids.userId3,
          'para mañana a las 10 de la mañana',
        );
        pasos.push({
          numero: 3,
          mensaje: 'para mañana a las 10 de la mañana',
          respuesta: {
            status: step3.status,
            intention: step3.body.intention,
            confidence: step3.body.confidence,
            conversationState: step3.body.conversationState,
            missingFields: step3.body.missingFields,
            reply: step3.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        // Paso 4: Teléfono
        const step4 = await testHelper.sendMessage(
          ids.clinicId,
          ids.userId3,
          'mi teléfono es 611223344',
        );
        pasos.push({
          numero: 4,
          mensaje: 'mi teléfono es 611223344',
          respuesta: {
            status: step4.status,
            intention: step4.body.intention,
            confidence: step4.body.confidence,
            conversationState: step4.body.conversationState,
            missingFields: step4.body.missingFields,
            reply: step4.body.reply,
          },
          timestamp: new Date().toISOString(),
        });

        const estadoFinal = step4.body.conversationState;
        // La clínica requiere pago, así que puede estar en awaiting_payment
        const exito = ['collecting', 'completed', 'awaiting_payment'].includes(estadoFinal);

        resultados.push({
          empresa: 'Clínica Dental Sonrisas',
          empresaId: ids.clinicId,
          tipo: 'clinic',
          servicio: 'cita',
          servicioNombre: 'Cita en clínica',
          pasos,
          resultadoFinal: {
            estado: estadoFinal,
            exito,
            errores: exito ? undefined : [`Estado inesperado: ${estadoFinal}`],
          },
          duracion: Date.now() - inicio,
        });

        expect(exito).toBe(true);
      } catch (error: any) {
        errores.push(error.message);
        resultados.push({
          empresa: 'Clínica Dental Sonrisas',
          empresaId: ids.clinicId,
          tipo: 'clinic',
          servicio: 'cita',
          servicioNombre: 'Cita en clínica',
          pasos,
          resultadoFinal: {
            estado: 'error',
            exito: false,
            errores,
          },
          duracion: Date.now() - inicio,
        });
        throw error;
      }
    }, 60000);
  });
});
