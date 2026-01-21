# Casos de Prueba Completos para el Bot de Reservas

## 📋 Configuración Postman

**Endpoint:** `POST http://localhost:3000/messages`  
**Headers:** `Content-Type: application/json`

---

## 🏢 IDs de Empresas y Servicios

### ⚠️ IMPORTANTE: Obtener IDs Reales

Los IDs se generan automáticamente al ejecutar el seed. Para obtenerlos:

1. **Ejecutar el seed:**
   ```bash
   npm run seed
   # o
   npx prisma db seed
   ```

2. **Ver IDs en consola:**
   - El seed imprime: `✅ Empresa creada: [Nombre] ([ID])`
   - Copia esos IDs y reemplázalos en los casos de prueba

3. **O consultar la API:**
   ```bash
   GET http://localhost:3000/companies
   ```

### Empresas Configuradas en el Seed

#### 1. Restaurante La Pasta
- **Tipo:** `restaurant`
- **Servicios disponibles:**
  - `mesa`: Mesa en restaurante (sin pago anticipado, sin productos)
  - `domicilio`: Servicio a domicilio (con pago anticipado, requiere productos, envío $5.000, mínimo $20.000)
- **ID real:** `d7ee0f53-4823-4a60-8421-58948e5ac5b5` ✅

#### 2. Clínica Dental Sonrisas
- **Tipo:** `clinic`
- **Servicios disponibles:**
  - `cita`: Cita en clínica (con pago anticipado, requiere tratamiento)
- **Tratamientos:** Limpieza dental, Consulta general, Ortodoncia, Blanqueamiento, etc.
- **ID real:** `f259d74c-841e-44a4-b6bb-fa622c2498d2` ✅

### IDs de Usuarios de Prueba

- **Juan Pérez:** `d9155265-a393-4ce2-a00b-e1cedec0ba36` (tel: 612345678) ✅
- **María García:** `c57b469a-bb1b-4e4a-b7da-75dd376c1374` (tel: 698765432) ✅
- **Carlos López:** `e78db803-0e9e-4b5a-bfb1-056dfd5fb32e` (tel: 611223344) ✅

> **Nota:** Estos usuarios se crean automáticamente en el seed. Si necesitas más usuarios, consulta `prisma/seed.ts`.

---

## FLUJO 1: Restaurante - Pedido a Domicilio Completo

### Escenario: Cliente quiere pedir comida a domicilio para hoy

**Paso 1.1: Saludo inicial**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "hola, buenas tardes"
}
```
**Esperado:** 
- Intención: `saludar`
- Respuesta: Saludo y ofrecimiento de ayuda

---

**Paso 1.2: Consulta de menú**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "qué tienen en el menú?"
}
```
**Esperado:** 
- Intención: `consultar`
- Respuesta: Muestra menú completo con precios (Pizzas, Pastas, Bebidas, Postres)

---

**Paso 1.3: Solicitud de domicilio**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero un domicilio para hoy"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio detectado: `domicilio`** ⚠️ (DEBE estar presente, NO null)
- Fecha: hoy
- Estado: `collecting`
- Campos faltantes: hora, productos, teléfono

---

**Paso 1.4: Proporciona hora**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "para las 8 de la noche"
}
```
**Esperado:** 
- Confirma hora: 20:00
- **Mantiene servicio: `domicilio`** ⚠️
- Estado: `collecting`
- Campos faltantes: productos, teléfono

---

**Paso 1.5: Selecciona productos**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero una pizza margherita y una coca cola"
}
```
**Esperado:** 
- Confirma productos seleccionados
- **Mantiene servicio: `domicilio`** ⚠️
- Estado: `collecting`
- Campos faltantes: teléfono

---

**Paso 1.6: Proporciona teléfono**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "mi teléfono es 612345678"
}
```
**Esperado:** 
- Confirma pedido completo
- **Servicio: `domicilio`** ⚠️
- Muestra total (productos + envío $5.000)
- Estado: `completed`
- Pide dirección o confirma reserva

---

## FLUJO 2: Restaurante - Reserva de Mesa Completa

### Escenario: Cliente quiere reservar mesa en el restaurante

**Paso 2.1: Inicia conversación**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "buenos días"
}
```
**Esperado:** Saludo y ofrecimiento de ayuda

---

**Paso 2.2: Consulta disponibilidad**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "hay disponibilidad para el sábado a las 8pm?"
}
```
**Esperado:** 
- Intención: `consultar`
- Responde con disponibilidad específica para sábado 20:00
- **NO muestra menú completo** ⚠️
- **NO muestra tipos de reserva** ⚠️
- Solo información de disponibilidad

---

**Paso 2.3: Decide reservar**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "sí, quiero reservar una mesa para ese día"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio detectado: `mesa`** ⚠️
- Usa fecha del contexto: sábado
- Usa hora del contexto: 20:00
- Estado: `collecting`
- Campos faltantes: comensales, teléfono

---

**Paso 2.4: Proporciona datos faltantes**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "somos 3 personas y mi teléfono es 698765432"
}
```
**Esperado:** 
- Confirma reserva completa
- **Servicio: `mesa`** ⚠️
- Fecha: sábado
- Hora: 20:00
- Comensales: 3
- Teléfono: 698765432
- Estado: `completed`

---

## FLUJO 3: Cambio de Servicio Durante Reserva

### Escenario: Cliente cambia de mesa a domicilio

**Paso 3.1: Inicia reserva de mesa**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero reservar una mesa para mañana"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `mesa`** ⚠️
- Fecha: mañana
- Estado: `collecting`
- Campos faltantes: hora, comensales, teléfono

---

**Paso 3.2: Cambia a domicilio**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "mejor quiero un pedido a domicilio"
}
```
**Esperado:** 
- Detecta cambio de servicio
- **Servicio actualizado: `domicilio`** ⚠️
- Mantiene fecha: mañana
- Estado: `collecting`
- Campos faltantes: hora, productos, teléfono

---

## FLUJO 4: Cancelación Correcta

### Escenario: Cliente cancela reserva (NO debe detectar como reservar)

**Paso 4.1: Cancela reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero cancelar mi reserva"
}
```
**Esperado:** 
- Intención: `cancelar` ⚠️ (NO `reservar`)
- **NO debe detectar como "reservar" aunque contenga "reserva"** ⚠️
- NO pide datos de reserva
- Muestra reservas activas o confirma cancelación
- Estado: `idle` (resetea contexto)

---

**Paso 4.2: Hace nueva reserva después**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero hacer una nueva reserva para el viernes"
}
```
**Esperado:** 
- Intención: `reservar`
- Inicia proceso de reserva limpio (sin contexto de cancelación)
- Fecha: viernes
- Estado: `collecting`

---

## FLUJO 5: Consulta de Disponibilidad Específica

### Escenario: Cliente pregunta disponibilidad (NO debe mostrar menú)

**Paso 5.1: Consulta disponibilidad con fecha**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "hay disponibilidad para el domingo?"
}
```
**Esperado:** 
- Intención: `consultar` ⚠️
- Responde con disponibilidad específica para domingo
- **NO muestra menú completo** ⚠️
- **NO muestra tipos de reserva** ⚠️
- Solo información de disponibilidad (horarios, disponibilidad de mesas)

---

## FLUJO 6: Múltiples Empresas - Contexto Independiente

### Escenario: Usuario consulta diferentes empresas

**Paso 6.1: Consulta Restaurante**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "qué tienen de menú?"
}
```
**Esperado:** Muestra menú del Restaurante La Pasta

---

**Paso 6.2: Consulta Clínica Dental (diferente empresa)**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "hola, qué servicios tienen?"
}
```
**Esperado:** 
- **Contexto independiente** ⚠️ (no usa contexto del restaurante anterior)
- Muestra servicios/tratamientos de la clínica
- NO muestra menú del restaurante

---

## FLUJO 7: Conversación Larga - Varias Consultas

### Escenario: Cliente hace múltiples preguntas antes de reservar

**Paso 7.1: Saludo**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "hola"
}
```
**Esperado:** Saludo y ofrecimiento de ayuda

---

**Paso 7.2: Consulta horarios**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "qué horarios tienen?"
}
```
**Esperado:** Muestra horarios de atención

---

**Paso 7.3: Consulta menú**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "y qué tienen de comida?"
}
```
**Esperado:** Muestra menú completo

---

**Paso 7.4: Consulta disponibilidad**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "tienen mesa para mañana sábado a las 8?"
}
```
**Esperado:** 
- Intención: `consultar`
- Responde disponibilidad para sábado 20:00

---

**Paso 7.5: Reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "perfecto, quiero reservar para 4 personas, mi teléfono es 698765432"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `mesa`** ⚠️
- Usa fecha del contexto: sábado
- Usa hora del contexto: 20:00
- Comensales: 4
- Teléfono: 698765432
- Estado: `completed`

---

## FLUJO 8: Domicilio con Todo en un Mensaje

### Escenario: Pedido completo a domicilio en un solo mensaje

**Paso 8.1: Pedido completo**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero un domicilio para hoy a las 7pm, quiero 2 pizzas pepperoni, una lasagna y 3 coca colas, teléfono 612345678"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `domicilio`** ⚠️ (DEBE estar presente, NO null)
- Fecha: hoy
- Hora: 19:00
- Productos: 2x Pizza Pepperoni, 1x Lasagna, 3x Coca Cola
- Teléfono: 612345678
- Estado: `completed`
- Confirma pedido completo con total (productos + envío $5.000)

---

## FLUJO 9: Corrección de Datos Durante Reserva

### Escenario: Cliente corrige información

**Paso 9.1: Inicia reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "quiero reservar una mesa para mañana a las 8 para 2 personas"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `mesa`** ⚠️
- Fecha: mañana
- Hora: 20:00
- Comensales: 2
- Estado: `collecting`
- Campos faltantes: teléfono

---

**Paso 9.2: Corrige hora**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "mejor a las 9 de la noche"
}
```
**Esperado:** 
- Actualiza hora: 21:00
- **Mantiene servicio: `mesa`** ⚠️
- Mantiene fecha: mañana
- Mantiene comensales: 2
- Estado: `collecting`

---

**Paso 9.3: Corrige número de personas**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "somos 3 personas en realidad"
}
```
**Esperado:** 
- Actualiza comensales: 3
- **Mantiene servicio: `mesa`** ⚠️
- Mantiene fecha: mañana
- Mantiene hora: 21:00
- Estado: `collecting`

---

## FLUJO 10: Clínica Dental - Reserva de Cita Completa

### Escenario: Cliente quiere agendar cita en clínica dental

**Paso 10.1: Saludo**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "buenos días"
}
```
**Esperado:** Saludo y ofrecimiento de ayuda

---

**Paso 10.2: Consulta servicios**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "qué servicios tienen?"
}
```
**Esperado:** Muestra tratamientos disponibles (Limpieza, Consulta, Ortodoncia, Blanqueamiento, etc.)

---

**Paso 10.3: Solicita cita**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero una cita para limpieza dental"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `cita`** ⚠️
- Tratamiento: limpieza dental
- Estado: `collecting`
- Campos faltantes: fecha, hora, teléfono

---

**Paso 10.4: Proporciona fecha y hora**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "para el próximo lunes a las 10 de la mañana"
}
```
**Esperado:** 
- Confirma fecha: próximo lunes
- Confirma hora: 10:00
- **Mantiene servicio: `cita`** ⚠️
- **Mantiene tratamiento: limpieza dental** ⚠️
- Estado: `collecting`
- Campos faltantes: teléfono

---

 **Paso 10.5: Proporciona teléfono**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "mi teléfono es 612345678"
}
```
**Esperado:** 
- Confirma cita completa
- **Servicio: `cita`** ⚠️
- Tratamiento: limpieza dental
- Fecha: próximo lunes
- Hora: 10:00
- Teléfono: 612345678
- Estado: `completed`
- Muestra información de pago (100% anticipado)

---

## FLUJO 11: Diferentes Formas de Pedir Domicilio

### Test 11.1: "quiero un domicilio"
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero un domicilio para hoy"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `domicilio`** ⚠️ (DEBE estar presente, NO null)
- Fecha: hoy
- Estado: `collecting`

---

### Test 11.2: "necesito un pedido a domicilio"
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "necesito un pedido a domicilio para mañana"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `domicilio`** ⚠️
- Fecha: mañana

---

### Test 11.3: "delivery"
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero hacer un delivery"
}
```
**Esperado:** 
- Intención: `reservar`
- **Servicio: `domicilio`** ⚠️

---

## Checklist de Validación

Para cada test, verificar:

✅ **Detección correcta de intención:**
- "quiero un domicilio" → `reservar` con servicio `domicilio`
- "quiero cancelar" → `cancelar` (NO `reservar`)
- "hay disponibilidad" → `consultar` (NO muestra menú completo)

✅ **Extracción de servicio:**
- "domicilio", "delivery", "pedido a domicilio", "quiero un domicilio" → servicio: `domicilio`
- "mesa", "reservar mesa" → servicio: `mesa`
- El servicio NO debe ser `null` cuando se menciona

✅ **Contexto independiente por empresa:**
- Cambiar `companyId` resetea contexto
- Cada empresa mantiene su propio historial

✅ **Conversaciones largas:**
- El bot mantiene contexto entre múltiples mensajes
- Puede hacer varias consultas antes de reservar
- Puede corregir información sin perder datos previos

---

## Notas Importantes

- **Mismo userId + mismo companyId = misma conversación**: Usa el mismo `userId` y `companyId` para continuar una conversación
- **Diferente companyId = contexto nuevo**: Cada empresa tiene su propio contexto
- **Servicio "domicilio"**: Debe detectarse en frases como "quiero un domicilio", "necesito un domicilio", "pedido a domicilio"
- **Cancelación**: "quiero cancelar mi reserva" NO debe detectarse como "reservar"
