# 📮 Especificaciones de Requests para Postman

Especificaciones completas de todas las conversaciones con métodos, URLs y body JSON listos para copiar en Postman. **USANDO DATOS REALES DEL SEEDER.**

---

## 📋 Datos Reales del Seeder

**Empresas:**
- **Restaurante La Pasta:** `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`
- **Clínica Dental Sonrisas:** `f05c83f1-e88d-43c4-accf-5cea6e951792`

**Usuarios:**
- **Juan Pérez:** ID: `f979cfa6-317b-4510-8576-eda6d6906649`, Teléfono: `612345678`
- **María García:** ID: `164729f2-f0de-425b-ba00-5ab4ae944987`, Teléfono: `698765432`
- **Carlos López:** ID: `12771d03-09df-43d7-beef-443eca89de87`, Teléfono: `611223344`

**Base URL:** `http://localhost:3030`

---

## 🍽️ RESTAURANTE

### Request 1: Saludo

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "Hola"
}
```

---

### Request 2: Consulta Menú

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "¿Qué tienen en el menú?"
}
```

---

### Request 3: Consulta Servicios

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "¿Qué servicios tienen?"
}
```

---

### Request 4: Reserva Completa

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "Quiero reservar una mesa para mañana a las 8pm para 4 personas, mi teléfono es 612345678 y mi nombre es Juan Pérez"
}
```

**Nota:** Guarda el `conversationId` de la respuesta. Ejemplo: `f979cfa6-317b-4510-8576-eda6d6906649_3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`

---

### Request 5: Reserva Todo en Uno

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "Hola, quiero reservar una mesa para pasado mañana a las 8pm para 4 personas, mi teléfono es 612345678"
}
```

---

### Request 6: Consulta Horarios

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "612345678",
  "message": "¿A qué hora abren?"
}
```

---

### Request 7: Servicio a Domicilio

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "611223344",
  "message": "Quiero pedir a domicilio"
}
```

---

### Request 8: Especificar Pedido Domicilio

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "611223344",
  "message": "Quiero 2 pizzas margherita y 1 pasta carbonara para hoy a las 7pm, dirección Calle Principal 123"
}
```

---

### Request 9: Cancelar Reservas

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "698765432",
  "message": "Quiero cancelar mis reservas"
}
```

---

### Request 10: Seleccionar Reserva por Número

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
  "phone": "698765432",
  "message": "1"
}
```

---

## 🦷 CLÍNICA

### Request 11: Consulta Tratamientos

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "¿Qué tratamientos ofrecen?"
}
```

---

### Request 12: Consulta Servicios

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "¿Cuáles son sus servicios?"
}
```

---

### Request 13: Agendar Cita

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "Quiero agendar una cita para mañana a las 2pm"
}
```

**Nota:** Guarda el `conversationId` de la respuesta. Ejemplo: `164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792`

---

### Request 14: Completar Datos Cita

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "Mi teléfono es 698765432 y mi nombre es María García"
}
```

---

### Request 15: Cita Todo en Uno

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "Quiero agendar una cita para el viernes a las 10am, mi nombre es María García y mi teléfono es 698765432"
}
```

**Nota:** Guarda el `conversationId` de la respuesta para crear el pago.

---

### Request 16: Consulta Horarios Clínica

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "698765432",
  "message": "¿Cuáles son sus horarios?"
}
```

---

### Request 17: Cancelar Cita

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "612345678",
  "message": "Quiero cancelar mi cita"
}
```

---

### Request 18: Confirmar Cancelación

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "612345678",
  "message": "Sí, confirmo"
}
```

---

### Request 19: Validación - Sin Reservas

**Método:** `POST`  
**URL:** `http://localhost:3030/messages`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "phone": "611223344",
  "message": "Quiero cancelar mi cita"
}
```

---

## 💳 PAGOS - CLÍNICA

### Request 20: Crear Pago

**Método:** `POST`  
**URL:** `http://localhost:3030/payments`  
**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "conversationId": "164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792",
  "amount": 80000,
  "description": "Pago anticipado - Limpieza dental",
  "customerEmail": "maria@example.com",
  "customerName": "María García"
}
```

**Nota:** Reemplaza el `conversationId` con el obtenido de la Request 13 o 15. El formato es: `userId_companyId`.

**Ejemplo de conversationId real:**
- Para María García: `164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792`
- Para Juan Pérez: `f979cfa6-317b-4510-8576-eda6d6906649_f05c83f1-e88d-43c4-accf-5cea6e951792`

**Respuesta:** La respuesta incluirá `paymentUrl` (link de Wompi) y `id` (paymentId). Guarda el `id` para Request 21.

---

### Request 21: Verificar Estado de Pago

**Método:** `GET`  
**URL:** `http://localhost:3030/payments/[PAYMENT_ID]/status`  
**Headers:** (ninguno)

**Body:** (ninguno)

**Nota:** Reemplaza `[PAYMENT_ID]` con el `id` de la respuesta de Request 20.

**Ejemplo:**
```
GET http://localhost:3030/payments/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status
```

---

### Request 22: Ver Pagos de Conversación

**Método:** `GET`  
**URL:** `http://localhost:3030/payments/conversation/[CONVERSATION_ID]`  
**Headers:** (ninguno)

**Body:** (ninguno)

**Nota:** Reemplaza `[CONVERSATION_ID]` con el conversationId real.

**Ejemplo:**
```
GET http://localhost:3030/payments/conversation/164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792
```

---

### Request 23: Ver Pago Pendiente

**Método:** `GET`  
**URL:** `http://localhost:3030/payments/conversation/[CONVERSATION_ID]/pending`  
**Headers:** (ninguno)

**Body:** (ninguno)

**Nota:** Reemplaza `[CONVERSATION_ID]` con el conversationId real.

**Ejemplo:**
```
GET http://localhost:3030/payments/conversation/164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792/pending
```

---

### Request 24: Webhook Wompi

**Método:** `POST`  
**URL:** `http://localhost:3030/payments/webhook`  
**Headers:**
```
Content-Type: application/json
x-signature: signature-aqui
x-timestamp: timestamp-aqui
```

**Body:**
```json
{
  "event": "transaction.updated",
  "data": {
    "transaction": {
      "id": "transaction-id",
      "status": "APPROVED",
      "amount_in_cents": 8000000,
      "reference": "PAY-1234567890-abc123"
    }
  }
}
```

**Nota:** Este webhook se ejecuta automáticamente cuando Wompi notifica cambios en el pago.

---

## 📊 CONSULTAS - BASE DE DATOS

### Request 25: Ver Empresas

**Método:** `GET`  
**URL:** `http://localhost:3030/companies`  
**Headers:** (ninguno)

**Body:** (ninguno)

---

### Request 26: Ver Empresa Restaurante

**Método:** `GET`  
**URL:** `http://localhost:3030/companies/3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`  
**Headers:** (ninguno)

**Body:** (ninguno)

---

### Request 27: Ver Empresa Clínica

**Método:** `GET`  
**URL:** `http://localhost:3030/companies/f05c83f1-e88d-43c4-accf-5cea6e951792`  
**Headers:** (ninguno)

**Body:** (ninguno)

---

### Request 28: Ver Reservas

**Método:** `GET`  
**URL:** `http://localhost:3030/reservations?companyId=3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`  
**Headers:** (ninguno)

**Body:** (ninguno)

**Query Params:**
- `companyId`: `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d` (opcional)

---

### Request 29: Ver Intenciones

**Método:** `GET`  
**URL:** `http://localhost:3030/intentions?companyId=3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`  
**Headers:** (ninguno)

**Body:** (ninguno)

**Query Params:**
- `companyId`: `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d` (requerido)

---

## 🔄 FLUJOS COMPLETOS RECOMENDADOS

### Flujo 1: Restaurante Completo

1. **Request 1:** Saludo
2. **Request 2:** Consulta Menú
3. **Request 3:** Consulta Servicios
4. **Request 4:** Reserva Completa

**Limpia Redis después:**
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

### Flujo 2: Clínica con Pago (COMPLETO)

1. **Request 13:** Agendar Cita
   - Copia el `conversationId` de la respuesta
   - Ejemplo: `164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792`

2. **Request 14:** Completar Datos Cita

3. **Request 20:** Crear Pago
   - Usa el `conversationId` del paso 1
   - Body:
   ```json
   {
     "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
     "conversationId": "164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792",
     "amount": 80000,
     "description": "Pago anticipado - Limpieza dental",
     "customerEmail": "maria@example.com",
     "customerName": "María García"
   }
   ```
   - Copia el `id` (paymentId) de la respuesta

4. **Request 21:** Verificar Estado de Pago
   - Usa el `paymentId` del paso 3
   - URL: `http://localhost:3030/payments/[PAYMENT_ID]/status`

**Limpia Redis después:**
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

### Flujo 3: Cancelación

1. **Request 4:** Reserva Completa (crear reserva primero)
2. **Request 9:** Cancelar Reservas
3. **Request 10:** Seleccionar Reserva por Número

**Limpia Redis después:**
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

## 📝 Cómo Obtener IDs Reales

### Obtener ConversationId

1. Ejecuta Request 13 o 15 (Agendar Cita)
2. En la respuesta, busca el campo `conversationId`
3. Ejemplo de respuesta:
```json
{
  "reply": "...",
  "intention": "reservar",
  "conversationState": "completed",
  "conversationId": "164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792"
}
```
4. Copia el valor de `conversationId` y úsalo en Request 20

### Obtener PaymentId

1. Ejecuta Request 20 (Crear Pago)
2. En la respuesta, busca el campo `id`
3. Ejemplo de respuesta:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": 80000,
  "status": "PENDING",
  "paymentUrl": "https://checkout.wompi.co/l/transaction-id"
}
```
4. Copia el valor de `id` y úsalo en Request 21

### Formato de ConversationId

El `conversationId` tiene el formato: `userId_companyId`

**Ejemplos reales:**
- Juan Pérez + Restaurante: `f979cfa6-317b-4510-8576-eda6d6906649_3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`
- María García + Clínica: `164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792`
- Juan Pérez + Clínica: `f979cfa6-317b-4510-8576-eda6d6906649_f05c83f1-e88d-43c4-accf-5cea6e951792`

---

## 📝 Notas Importantes

### Respuestas Esperadas

**Respuesta de Mensaje:**
```json
{
  "reply": "¡Hola! Bienvenido a Restaurante La Pasta...",
  "intention": "saludar",
  "confidence": 1,
  "conversationState": "idle",
  "conversationId": "f979cfa6-317b-4510-8576-eda6d6906649_3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d"
}
```

**Respuesta de Pago:**
```json
{
  "id": "payment-uuid-real",
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "conversationId": "164729f2-f0de-425b-ba00-5ab4ae944987_f05c83f1-e88d-43c4-accf-5cea6e951792",
  "amount": 80000,
  "status": "PENDING",
  "paymentUrl": "https://checkout.wompi.co/l/transaction-id",
  "wompiReference": "PAY-1234567890-abc123"
}
```

### Limpiar Redis

Después de cada conversación completa, limpia Redis:
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

**Última actualización:** 2026-01-20  
**Todos los IDs son reales del seeder.**
