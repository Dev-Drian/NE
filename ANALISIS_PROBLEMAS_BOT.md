# Análisis de Problemas del Bot y Soluciones Propuestas

## 🔍 Problemas Identificados

### Problema 1: Consulta de Disponibilidad Específica
**Caso:** `"tienen mesa para mañana sábado a las 8?"`

**Comportamiento Actual:**
- Detecta intención: `consultar` ✅
- Responde con horarios genéricos: "Nuestro horario es de Lunes a Domingo: 12:00-22:00..." ❌
- **NO verifica disponibilidad específica** para ese día y hora ❌

**Causa Raíz:**
- En `bot-engine.service.ts` línea 290-315, cuando detecta "consultar", solo muestra horarios genéricos
- No detecta si la consulta incluye fecha/hora específica
- No llama a `availability.check()` para verificar disponibilidad real

**Solución Propuesta:**
1. Detectar si la consulta incluye fecha/hora específica
2. Si incluye fecha/hora, extraer esos datos con OpenAI
3. Llamar a `availability.check()` para verificar disponibilidad real
4. Responder con disponibilidad específica en lugar de horarios genéricos

---

### Problema 2: Servicio "domicilio" No Se Detecta Correctamente
**Caso:** `"quiero un domicilio para hoy"`

**Comportamiento Actual:**
- Detecta intención: `reservar` ✅
- **NO detecta servicio: `domicilio`** ❌ (falta en missingFields)
- Pide "personas" cuando debería pedir "productos" ❌
- El servicio "domicilio" requiere productos, NO personas

**Causa Raíz:**
1. **Extracción de servicio:** OpenAI puede estar extrayendo el servicio pero no se está guardando correctamente en `collected.service`
2. **Campos requeridos:** En `handleReservation()` línea 380-383, siempre pide `guests` si `settings.requireGuests` es true, pero para servicio "domicilio" debería pedir "productos"
3. **Validación de productos:** No hay lógica para validar que el servicio "domicilio" requiere productos antes de completar

**Solución Propuesta:**
1. Verificar que OpenAI extrae correctamente el servicio "domicilio" (ya está en el prompt)
2. Agregar lógica para detectar si el servicio requiere productos (`requiresProducts: true`)
3. Si el servicio requiere productos, NO pedir "personas", pedir "productos"
4. Validar que se hayan seleccionado productos antes de completar la reserva
5. Agregar "productos" a los campos requeridos cuando `service === 'domicilio'` y `requiresProducts === true`

---

### Problema 3: No Se Genera Link de Pago
**Caso:** Reserva completada que requiere pago (domicilio o cita en clínica)

**Comportamiento Actual:**
- Se crea la reserva correctamente ✅
- **NO se genera link de pago** ❌
- No se llama al servicio de pagos

**Causa Raíz:**
- En `handleReservation()` línea 464-494, después de crear la reserva, NO se verifica si requiere pago
- NO se llama a `PaymentsService.createPayment()`
- NO se verifica `service.requiresPayment` o `company.requiresPayment`

**Solución Propuesta:**
1. Después de crear la reserva exitosamente, verificar si requiere pago:
   - Si `service.requiresPayment === true` O `company.requiresPayment === true`
2. Calcular el monto a pagar:
   - Si es domicilio: suma de productos + envío
   - Si es cita: precio del tratamiento
   - Aplicar `paymentPercentage` (50% o 100%)
3. Crear conversación en BD si no existe
4. Llamar a `PaymentsService.createPayment()` con:
   - `companyId`
   - `conversationId`
   - `amount`
   - `description`
   - `customerEmail` (del usuario)
   - `customerName` (del usuario)
5. Incluir el link de pago en la respuesta de confirmación

---

## 📋 Plan de Implementación

### Paso 1: Arreglar Consulta de Disponibilidad Específica
- [ ] Modificar `handleConsultation()` o crear método `handleAvailabilityQuery()`
- [ ] Detectar si la consulta incluye fecha/hora
- [ ] Extraer fecha/hora con OpenAI si están presentes
- [ ] Llamar a `availability.check()` con fecha/hora extraída
- [ ] Responder con disponibilidad específica

### Paso 2: Arreglar Detección de Servicio "domicilio"
- [ ] Verificar que OpenAI extrae el servicio correctamente (debug)
- [ ] Agregar lógica para servicios que requieren productos
- [ ] Modificar campos requeridos según el servicio:
  - Si `service === 'domicilio'` y `requiresProducts === true`: NO pedir "personas", pedir "productos"
  - Si `service === 'mesa'`: pedir "personas" normalmente
- [ ] Validar productos antes de completar reserva

### Paso 3: Implementar Generación de Link de Pago
- [ ] Inyectar `PaymentsService` en `BotEngineService`
- [ ] Después de crear reserva, verificar si requiere pago
- [ ] Calcular monto según servicio y productos
- [ ] Crear pago con `PaymentsService.createPayment()`
- [ ] Incluir link de pago en respuesta de confirmación

---

## 🔧 Cambios de Código Necesarios

### 1. `src/bot-engine/bot-engine.service.ts`
- Modificar manejo de intención "consultar" para detectar consultas de disponibilidad específica
- Modificar `handleReservation()` para:
  - Validar productos cuando el servicio los requiere
  - Generar link de pago cuando se requiere

### 2. `src/bot-engine/layers/layer3-openai.service.ts`
- Verificar que el prompt extrae correctamente el servicio "domicilio"
- Asegurar que extrae productos cuando se mencionan

### 3. `src/messages-templates/messages-templates.service.ts`
- Agregar método para generar mensaje de confirmación con link de pago

---

## ✅ Criterios de Éxito

1. **Consulta de disponibilidad específica:**
   - "tienen mesa para mañana sábado a las 8?" → Responde con disponibilidad específica para ese día/hora

2. **Servicio domicilio:**
   - "quiero un domicilio para hoy" → Detecta servicio "domicilio", NO pide "personas", pide "productos"

3. **Link de pago:**
   - Al completar reserva de domicilio o cita → Genera link de pago y lo incluye en la respuesta

