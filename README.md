# Sistema de Bot de Reservas con ChatGPT

Sistema inteligente de bot para reservas utilizando una arquitectura de 3 capas de detección de intención que optimiza costos y velocidad usando OpenAI API (ChatGPT).

## 🏗️ Arquitectura

El sistema implementa 3 capas de detección:

1. **Capa 1 (Keywords)**: Detección rápida por palabras clave (< 1ms)
2. **Capa 2 (Similarity)**: Comparación con ejemplos usando similitud de texto (~100ms)
3. **Capa 3 (OpenAI)**: ChatGPT solo cuando las capas anteriores fallan (~1-2s)

## 📋 Requisitos

- Node.js v20+
- Docker y Docker Compose (para PostgreSQL y Redis)
- Git
- OpenAI API Key (obtén tu key en https://platform.openai.com/)

## 🚀 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Iniciar PostgreSQL y Redis con Docker:**
```bash
docker-compose up -d
```

Esto iniciará:
- PostgreSQL en el puerto 5432
- Redis en el puerto 6379

3. **Configurar variables de entorno:**
El archivo `.env` ya está creado con las URLs correctas. Solo necesitas:
- Editar `.env` y agregar tu `OPENAI_API_KEY`

Las URLs ya están configuradas:
- `DATABASE_URL`: postgresql://postgres:postgres@localhost:5432/bot_reservas?schema=public
- `REDIS_URL`: redis://localhost:6379

4. **Configurar base de datos:**
```bash
# Generar Prisma Client
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Poblar datos de ejemplo
npm run prisma:seed
```

5. **Iniciar servidor:**
```bash
npm run start:dev
```

El servidor estará disponible en `http://localhost:3000`

### 🛑 Detener servicios Docker

Para detener PostgreSQL y Redis:
```bash
docker-compose down
```

Para detener y eliminar los volúmenes (datos):
```bash
docker-compose down -v
```

## 📡 API Endpoints

### POST /messages

Endpoint principal para enviar mensajes al bot.

**Request:**
```json
{
  "companyId": "uuid-de-la-empresa",
  "userId": "user123",
  "message": "hola quiero una mesa"
}
```

**Response:**
```json
{
  "reply": "Para continuar necesito: fecha, hora, número de comensales, teléfono",
  "intention": "reservar",
  "confidence": 0.9,
  "missingFields": ["fecha", "hora", "guests", "phone"],
  "conversationState": "collecting"
}
```

## 🧪 Pruebas

Después de ejecutar el seed, puedes probar con:

```bash
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "uuid-de-la-empresa-del-seed",
    "userId": "test-user",
    "message": "quiero una mesa para 4 personas mañana a las 8pm"
  }'
```

## 📁 Estructura del Proyecto

```
src/
├── bot-engine/          # Motor del bot con 3 capas
├── companies/           # Módulo de empresas
├── intentions/          # Módulo de intenciones
├── conversations/       # Manejo de estado (Redis)
├── reservations/        # Gestión de reservas
├── availability/        # Verificación de disponibilidad
└── messages/            # Endpoint principal
```

## 💰 Costos de OpenAI

- Modelo: `gpt-4o-mini`
- Input: $0.15 por 1M tokens
- Output: $0.60 por 1M tokens

El sistema está optimizado para minimizar llamadas a OpenAI usando las capas 1 y 2 primero.

## 📝 Scripts Disponibles

- `npm run start:dev` - Iniciar en modo desarrollo
- `npm run build` - Compilar proyecto
- `npm run prisma:generate` - Generar Prisma Client
- `npm run prisma:migrate` - Ejecutar migraciones
- `npm run prisma:seed` - Poblar datos de ejemplo
- `npm run prisma:studio` - Abrir Prisma Studio

## 🔧 Tecnologías

- **Backend**: NestJS + TypeScript
- **Base de datos**: PostgreSQL + Prisma ORM
- **Cache**: Redis
- **IA**: OpenAI API (ChatGPT gpt-4o-mini)

