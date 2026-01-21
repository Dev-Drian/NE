# Casos de Prueba Realistas - Bot de Reservas

## Configuración Postman

**Endpoint:** `POST http://localhost:3000/messages`  
**Headers:** `Content-Type: application/json`

**IDs de Empresas:**
- Restaurante La Pasta: `d7ee0f53-4823-4a60-8421-58948e5ac5b5`
- Clínica Dental Sonrisas: `f259d74c-841e-44a4-b6bb-fa622c2498d2`

**IDs de Usuarios:**
- Juan Pérez: `d9155265-a393-4ce2-a00b-e1cedec0ba36` (tel: 612345678)
- María García: `c57b469a-bb1b-4e4a-b7da-75dd376c1374` (tel: 698765432)
- Carlos López: `e78db803-0e9e-4b5a-bfb1-056dfd5fb32e` (tel: 611223344)

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
**Esperado:** Saludo y ofrecimiento de ayuda

---

**Paso 1.2: Consulta de menú**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "qué tienen en el menú?"
}
```
**Esperado:** Muestra menú completo con precios

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
- Servicio detectado: `domicilio`
- Pide: hora, productos, teléfono

---

**Paso 1.4: Proporciona hora**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "para las 8 de la noche"
}
```
**Esperado:** Confirma hora, pide productos y teléfono

---

**Paso 1.5: Selecciona productos**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero una pizza margherita y una coca cola"
}
```
**Esperado:** Confirma productos, pide teléfono

---

**Paso 1.6: Proporciona teléfono**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "mi teléfono es 612345678"
}
```
**Esperado:** Confirma pedido, muestra total, pide dirección

---

## FLUJO 2: Clínica Dental - Cita Completa

### Escenario: Paciente necesita cita para limpieza dental

**Paso 2.1: Consulta inicial**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "buenos días, necesito una cita"
}
```
**Esperado:** Pregunta qué tipo de servicio necesita

---

**Paso 2.2: Especifica servicio**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "una limpieza dental"
}
```
**Esperado:** Confirma servicio, pide fecha, hora y teléfono

---

**Paso 2.3: Proporciona fecha**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "para el próximo viernes"
}
```
**Esperado:** Confirma fecha, pide hora y teléfono

---

**Paso 2.4: Proporciona hora**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "a las 2 de la tarde"
}
```
**Esperado:** Confirma hora, pide teléfono

---

**Paso 2.5: Proporciona teléfono**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "698765432"
}
```
**Esperado:** Confirma cita completa

---

## FLUJO 3: Restaurante - Cambio de Servicio

### Escenario: Cliente cambia de mesa a domicilio

**Paso 3.1: Inicia reserva de mesa**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero reservar una mesa para mañana"
}
```
**Esperado:** Pide hora, comensales, teléfono

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
- Actualiza a servicio "domicilio"
- Pide productos, hora, teléfono

---

## FLUJO 4: Múltiples Empresas - Comparación

### Escenario: Usuario consulta diferentes restaurantes

**Paso 4.1: Consulta Restaurante 1**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "qué tienen de menú?"
}
```
**Esperado:** Muestra menú del Restaurante La Pasta

---

**Paso 4.2: Consulta Restaurante 2 (diferente empresa)**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "hola, qué servicios tienen?"
}
```
**Esperado:** 
- Contexto independiente (no usa contexto del restaurante anterior)
- Muestra tratamientos/servicios de la clínica (no el menú del restaurante)

---

## FLUJO 5: Consulta de Disponibilidad Específica

### Escenario: Cliente pregunta disponibilidad antes de reservar

**Paso 5.1: Consulta disponibilidad**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "hay disponibilidad para el domingo a las 8pm?"
}
```
**Esperado:** 
- Intención: `consultar`
- Responde con disponibilidad específica
- NO muestra menú completo
- Sugiere hacer reserva

---

**Paso 5.2: Decide reservar**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "sí, quiero reservar para ese día"
}
```
**Esperado:** Continúa con proceso de reserva

---

## FLUJO 6: Cancelación y Nueva Reserva

### Escenario: Cliente cancela y hace nueva reserva

**Paso 6.1: Cancela reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero cancelar mi reserva"
}
```
**Esperado:** 
- Intención: `cancelar`
- NO detecta como "reservar"
- Muestra reservas activas o confirma cancelación

---

**Paso 6.2: Hace nueva reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero hacer una nueva reserva para el viernes"
}
```
**Esperado:** Inicia proceso de reserva limpio (sin contexto de cancelación)

---

## FLUJO 7: Clínica - Múltiples Servicios

### Escenario: Cliente consulta servicios de la clínica y agenda una cita

**Paso 7.1: Consulta servicios**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "e78db803-0e9e-4b5a-bfb1-056dfd5fb32e",
  "message": "qué tratamientos ofrecen?"
}
```
**Esperado:** Lista tratamientos disponibles (limpieza, consulta, ortodoncia, blanqueamiento, etc.)

---

**Paso 7.2: Pregunta por precio**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "e78db803-0e9e-4b5a-bfb1-056dfd5fb32e",
  "message": "cuánto cuesta una limpieza dental?"
}
```
**Esperado:** Muestra precio y detalles del tratamiento

---

**Paso 7.3: Agenda cita**
```json
{
  "companyId": "f259d74c-841e-44a4-b6bb-fa622c2498d2",
  "userId": "e78db803-0e9e-4b5a-bfb1-056dfd5fb32e",
  "message": "quiero agendar una limpieza para el sábado a las 10am, mi teléfono es 611223344"
}
```
**Esperado:** Inicia/continúa el flujo de reserva de cita (pide lo que falte y al completar genera link de pago)

---

## FLUJO 8: Conversación Larga - Varias Consultas

### Escenario: Cliente hace múltiples preguntas antes de reservar

**Paso 8.1: Saludo**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "hola"
}
```

---

**Paso 8.2: Consulta horarios**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "qué horarios tienen?"
}
```

---

**Paso 8.3: Consulta menú**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "y qué tienen de comida?"
}
```

---

**Paso 8.4: Consulta disponibilidad**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "tienen mesa para mañana sábado a las 8?"
}
```

---

**Paso 8.5: Reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "perfecto, quiero reservar para 4 personas, mi teléfono es 698765432"
}
```

---

## FLUJO 9: Domicilio con Productos Específicos

### Escenario: Pedido completo a domicilio

**Paso 9.1: Solicita domicilio**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "quiero pedir a domicilio"
}
```
**Esperado:** Pide fecha, hora, productos, teléfono

---

**Paso 9.2: Proporciona todo junto**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "d9155265-a393-4ce2-a00b-e1cedec0ba36",
  "message": "para hoy a las 7pm, quiero 2 pizzas pepperoni, una lasagna y 3 coca colas, teléfono 612345678"
}
```
**Esperado:** Confirma pedido completo con total

---

## FLUJO 10: Corrección de Datos

### Escenario: Cliente corrige información durante la reserva

**Paso 10.1: Inicia reserva**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "quiero reservar una mesa para mañana a las 8 para 2 personas"
}
```

---

**Paso 10.2: Corrige hora**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "mejor a las 9 de la noche"
}
```
**Esperado:** Actualiza hora, mantiene otros datos

---

**Paso 10.3: Corrige número de personas**
```json
{
  "companyId": "d7ee0f53-4823-4a60-8421-58948e5ac5b5",
  "userId": "c57b469a-bb1b-4e4a-b7da-75dd376c1374",
  "message": "somos 3 personas en realidad"
}
```
**Esperado:** Actualiza comensales, mantiene otros datos

---

## Checklist de Validación

Para cada test, verificar:

✅ **Detección correcta de intención:**
- "quiero un domicilio" → `reservar` con servicio `domicilio`
- "quiero cancelar" → `cancelar` (NO `reservar`)
- "hay disponibilidad" → `consultar` (NO muestra menú completo)

✅ **Extracción de servicio:**
- "domicilio", "delivery", "pedido a domicilio" → servicio: `domicilio`
- "mesa", "reservar mesa" → servicio: `mesa`
- "limpieza dental" → servicio: `limpieza`

✅ **Contexto independiente por empresa:**
- Cambiar `companyId` resetea contexto
- Cada empresa mantiene su propio historial

✅ **Conversaciones largas:**
- El bot mantiene contexto entre múltiples mensajes
- Puede hacer varias consultas antes de reservar
- Puede corregir información sin perder datos previos

