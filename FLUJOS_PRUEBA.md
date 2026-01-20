# 🧪 Flujos de Prueba - Bot de Reservas

Guía compacta con flujos de prueba por conversación. **IMPORTANTE:** Limpia Redis después de cada flujo.

---

## 📋 IDs de Referencia

**Empresas:**
- **Restaurante La Pasta:** `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d` (mesa/domicilio)
- **Clínica Dental Sonrisas:** `f05c83f1-e88d-43c4-accf-5cea6e951792` (citas)

**Usuarios:**
- Juan Pérez: `612345678`
- María García: `698765432`
- Carlos López: `611223344`

**Comando Limpiar Redis:**
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

## 🍽️ CONVERSACIÓN 1: Restaurante - Consulta Completa

### Flujo
```bash
# 1. Saludo
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"Hola"}'

# 2. Consulta menú
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"¿Qué tienen en el menú?"}'

# 3. Consulta servicios
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"¿Qué servicios tienen?"}'

# 4. Limpiar cache después del flujo
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Muestra menú completo y servicios (mesa/domicilio) con formato profesional.

---

## 🦷 CONVERSACIÓN 2: Clínica - Consulta de Tratamientos

### Flujo
```bash
# 1. Consulta tratamientos
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"¿Qué tratamientos ofrecen?"}'

# 2. Consulta servicios
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"¿Cuáles son sus servicios?"}'

# 3. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Muestra tratamientos por categoría (preventivo, ortodoncia, estética, etc.) y servicios disponibles.

---

## 📅 CONVERSACIÓN 3: Restaurante - Reserva Completa

### Flujo
```bash
# 1. Reserva con todos los datos
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"Quiero reservar una mesa para mañana a las 8pm para 4 personas, mi teléfono es 612345678 y mi nombre es Juan Pérez"}'

# 2. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Reserva confirmada directamente. Intención: `reservar`, Estado: `completed`.

---

## 🦷 CONVERSACIÓN 4: Clínica - Cita por Pasos

### Flujo
```bash
# 1. Solicitar cita
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Quiero agendar una cita para mañana a las 2pm"}'

# 2. Completar datos
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Mi teléfono es 698765432 y mi nombre es María García"}'

# 3. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Primero extrae fecha/hora, luego solicita datos faltantes, finalmente confirma.

---

## 🗑️ CONVERSACIÓN 5: Cancelación - Reserva Única

### Flujo
```bash
# 1. Crear reserva primero (usa CONVERSACIÓN 3 o crea manualmente)
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"612345678","message":"Quiero agendar una cita para pasado mañana a las 10am, mi nombre es Juan"}'

sleep 2

# 2. Solicitar cancelación
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"612345678","message":"Quiero cancelar mi cita"}'

# 3. Confirmar cancelación
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"612345678","message":"Sí, confirmo"}'

# 4. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Pide confirmación, luego cancela realmente en BD (status = 'cancelled').

---

## 📋 CONVERSACIÓN 6: Cancelación - Múltiples Reservas

### Flujo
```bash
# 1. Crear primera reserva
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"698765432","message":"Quiero reservar una mesa para pasado mañana a las 7pm para 2 personas, mi teléfono es 698765432"}'

sleep 2

# 2. Crear segunda reserva
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"698765432","message":"Quiero otra reserva para el viernes a las 9pm para 4 personas"}'

sleep 2

# 3. Solicitar cancelación
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"698765432","message":"Quiero cancelar mis reservas"}'

# 4. Seleccionar por número
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"698765432","message":"1"}'

# 5. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Lista todas las reservas numeradas, permite seleccionar por número y cancela la correcta.

---

## 🚚 CONVERSACIÓN 7: Restaurante - Servicio a Domicilio

### Flujo
```bash
# 1. Solicitar domicilio
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"611223344","message":"Quiero pedir a domicilio"}'

# 2. Especificar pedido
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"611223344","message":"Quiero 2 pizzas margherita y 1 pasta carbonara para hoy a las 7pm, dirección Calle Principal 123"}'

# 3. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Detecta servicio "domicilio", solicita productos y dirección.

---

## ⏰ CONVERSACIÓN 8: Consulta de Horarios

### Flujo
```bash
# 1. Consulta horarios restaurante
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"¿A qué hora abren?"}'

# 2. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL

# 3. Consulta horarios clínica
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"¿Cuáles son sus horarios?"}'

# 4. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Muestra solo horarios de atención sin productos/servicios.

---

## 🔄 CONVERSACIÓN 9: Reserva Todo en Uno

### Flujo
```bash
# 1. Restaurante - Todo en un mensaje
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"Hola, quiero reservar una mesa para pasado mañana a las 8pm para 4 personas, mi teléfono es 612345678"}'

# 2. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL

# 3. Clínica - Todo en un mensaje
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Quiero agendar una cita para el viernes a las 10am, mi nombre es María García y mi teléfono es 698765432"}'

# 4. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Extrae todos los datos del mensaje y confirma directamente.

---

## 💳 CONVERSACIÓN 10: Clínica - Reserva con Pago Completo

### Flujo
```bash
# 1. Agendar cita completa
RESPONSE=$(curl -s -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Quiero agendar una cita para mañana a las 2pm para limpieza dental, mi nombre es María García, teléfono 698765432 y email maria@example.com"}')

# 2. Extraer conversationId de la respuesta (requiere jq o manualmente)
CONVERSATION_ID=$(echo $RESPONSE | grep -o '"conversationId":"[^"]*' | cut -d'"' -f4)
echo "Conversation ID: $CONVERSATION_ID"

# 3. Crear pago (reemplaza $CONVERSATION_ID con el ID real de la respuesta anterior)
curl -X POST http://localhost:3030/payments -H "Content-Type: application/json" \
  -d '{
    "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
    "conversationId": "'$CONVERSATION_ID'",
    "amount": 80000,
    "description": "Pago anticipado - Limpieza dental",
    "customerEmail": "maria@example.com",
    "customerName": "María García"
  }'

# 4. Verificar estado del pago (reemplaza PAYMENT_ID con el ID de la respuesta anterior)
curl http://localhost:3030/payments/PAYMENT_ID/status

# 5. Ver pagos de la conversación
curl http://localhost:3030/payments/conversation/$CONVERSATION_ID

# 6. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

### Flujo Manual (paso a paso)
```bash
# PASO 1: Agendar cita
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Quiero agendar una cita para mañana a las 2pm para limpieza dental"}'

# PASO 2: Completar datos
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"Mi nombre es María García, teléfono 698765432 y email maria@example.com"}'

# PASO 3: Obtener conversationId de la respuesta del paso 2
# Busca el campo "conversationId" en la respuesta JSON

# PASO 4: Crear pago (reemplaza CONVERSATION_ID con el ID real)
curl -X POST http://localhost:3030/payments -H "Content-Type: application/json" \
  -d '{
    "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
    "conversationId": "CONVERSATION_ID_AQUI",
    "amount": 80000,
    "description": "Pago anticipado - Limpieza dental",
    "customerEmail": "maria@example.com",
    "customerName": "María García"
  }'

# PASO 5: La respuesta incluirá paymentUrl (link de Wompi)
# Abre el link en el navegador para procesar el pago

# PASO 6: Verificar estado después del pago
curl http://localhost:3030/payments/PAYMENT_ID/status

# PASO 7: Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:**
- ✅ Cita agendada con todos los datos
- ✅ Pago creado con `paymentUrl` de Wompi
- ✅ Estado inicial: `PENDING`
- ✅ Después de pagar: Estado `APPROVED` (vía webhook)
- ✅ URL de pago: `https://checkout.wompi.co/l/TRANSACTION_ID`

**Nota:** En modo sandbox de Wompi, usa tarjetas de prueba:
- Aprobada: `4242424242424242`
- Rechazada: `4000000000000002`

---

## ❌ CONVERSACIÓN 11: Validación - Sin Reservas

### Flujo
```bash
# 1. Intentar cancelar sin reservas
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"611223344","message":"Quiero cancelar mi cita"}'

# 2. Limpiar cache
docker exec bot-reservas-redis redis-cli FLUSHALL
```

**Esperado:** Mensaje apropiado indicando que no hay reservas activas.

---

## 🧪 Script Rápido - Ejecutar Flujos Básicos

```bash
#!/bin/bash

# Limpiar todo al inicio
docker exec bot-reservas-redis redis-cli FLUSHALL

# CONVERSACIÓN 1: Consulta menú
echo "🧪 CONVERSACIÓN 1: Restaurante - Consulta menú"
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"¿Qué tienen en el menú?"}'
docker exec bot-reservas-redis redis-cli FLUSHALL
sleep 1

# CONVERSACIÓN 2: Consulta tratamientos
echo "🧪 CONVERSACIÓN 2: Clínica - Consulta tratamientos"
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"f05c83f1-e88d-43c4-accf-5cea6e951792","phone":"698765432","message":"¿Qué tratamientos ofrecen?"}'
docker exec bot-reservas-redis redis-cli FLUSHALL
sleep 1

# CONVERSACIÓN 3: Reserva restaurante
echo "🧪 CONVERSACIÓN 3: Restaurante - Reserva"
curl -X POST http://localhost:3030/messages -H "Content-Type: application/json" \
  -d '{"companyId":"3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d","phone":"612345678","message":"Quiero reservar una mesa para mañana a las 8pm para 4 personas"}'
docker exec bot-reservas-redis redis-cli FLUSHALL

echo "✅ Flujos básicos ejecutados"
echo "💳 Para probar pagos, ejecuta CONVERSACIÓN 10 manualmente"
```

---

## 📊 Verificaciones Rápidas

### Ver reservas en BD
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT date, time, status, phone, guests FROM reservations ORDER BY created_at DESC LIMIT 10;"
```

### Ver pagos en BD
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, amount, status, \"wompiReference\", \"paymentUrl\", \"createdAt\" FROM payments ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### Ver conversaciones en Redis
```bash
docker exec bot-reservas-redis redis-cli KEYS "conversation:*"
```

### Ver conversaciones en BD
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, \"companyId\", \"userId\", \"createdAt\" FROM conversations ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### Limpiar TODO (BD + Redis)
```bash
# Limpiar Redis
docker exec bot-reservas-redis redis-cli FLUSHALL

# Resetear BD (opcional - borra TODO)
npx prisma migrate reset --force
```

---

## ✅ Checklist de Validaciones

- ✅ **Detección:** `saludar`, `consultar`, `reservar`, `cancelar`
- ✅ **Productos:** Muestra menú/tratamientos agrupados por categoría
- ✅ **Servicios:** Muestra tipos de reserva/cita con detalles
- ✅ **Extracción:** Fecha, hora, comensales, teléfono, nombre
- ✅ **Confirmación:** Pide confirmación antes de cancelar
- ✅ **BD:** Cancelación real (status = 'cancelled')
- ✅ **Pagos:** Creación de pago con Wompi, link de pago, verificación de estado
- ✅ **Formato:** Emojis, separadores, precios formateados

---

## 💳 Endpoints de Pago

### Crear Pago
```bash
POST /payments
Content-Type: application/json

{
  "companyId": "f05c83f1-e88d-43c4-accf-5cea6e951792",
  "conversationId": "conversation-id-aqui",
  "amount": 80000,
  "description": "Pago anticipado - Limpieza dental",
  "customerEmail": "maria@example.com",
  "customerName": "María García"
}
```

### Verificar Estado del Pago
```bash
GET /payments/:id/status
```

### Ver Pagos de Conversación
```bash
GET /payments/conversation/:conversationId
```

### Ver Pago Pendiente de Conversación
```bash
GET /payments/conversation/:conversationId/pending
```

### Webhook Wompi (automático)
```bash
POST /payments/webhook
# Wompi envía notificaciones automáticamente
```

---

**💡 Tip:** Siempre limpia Redis después de cada conversación para probar flujos aislados.

**Última actualización:** 2026-01-20
