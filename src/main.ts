import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Suprimir warning de punycode (deprecation warning de Node.js 21+)
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    // Suprimir solo el warning de punycode
    return;
  }
  // Mostrar otros warnings
  console.warn(warning.name, warning.message);
});

// Polyfill para fetch, Headers, Request, Response (requerido por Gemini SDK en Node.js < 18)
import fetch, { Headers, Request, Response } from 'node-fetch';
if (!globalThis.fetch) {
  (globalThis as any).fetch = fetch;
  (globalThis as any).Headers = Headers;
  (globalThis as any).Request = Request;
  (globalThis as any).Response = Response;
}

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS
  app.enableCors();

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3030;
  await app.listen(port);
  
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
}

bootstrap();

