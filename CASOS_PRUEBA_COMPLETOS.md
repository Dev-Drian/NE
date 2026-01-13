# Casos de Prueba Completos para el Bot de Reservas

## Configuración Postman

**Endpoint:** `POST http://localhost:3000/messages`  
**Headers:** `Content-Type: application/json`

**IDs para usar:**
- Company ID: `12f242a4-216a-4a1f-8f59-e924b46b8959`
- User ID 1: `8164b55f-9495-41f4-b2ee-4cb84eeffcdf` (Juan Pérez)
- User ID 2: `aee44ff7-29dc-4012-9783-8539e59774ab` (María García)

---

## FLUJO 1: Conversación Completa de Reserva (Paso a Paso)

### Paso 1.1: Usuario saluda
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "hola"
}
```
**Esperado:** Bot responde con saludo y ofrece ayuda

---

### Paso 1.2: Usuario expresa intención de reservar
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "quiero reservar una mesa"
}
```
**Esperado:** Bot pregunta por datos faltantes (fecha, hora, comensales, teléfono)

---

### Paso 1.3: Usuario proporciona fecha y hora
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "para mañana a las 8 de la noche"
}
```
**Esperado:** Bot sigue pidiendo datos faltantes (comensales, teléfono)

---

### Paso 1.4: Usuario proporciona número de comensales
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "somos 4 personas"
}
```
**Esperado:** Bot pide teléfono

---

### Paso 1.5: Usuario proporciona teléfono
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "mi teléfono es 612345678"
}
```
**Esperado:** Bot verifica disponibilidad y confirma reserva

---

## FLUJO 2: Reserva Completa en un Solo Mensaje

### Test 2.1: Reserva con todos los datos
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "aee44ff7-29dc-4012-9783-8539e59774ab",
  "message": "quiero reservar una mesa para el viernes a las 20:00 para 2 personas, mi teléfono es 698765432"
}
```
**Esperado:** Bot extrae todos los datos, verifica disponibilidad y confirma

---

### Test 2.2: Reserva con formato natural
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "aee44ff7-29dc-4012-9783-8539e59774ab",
  "message": "necesito una mesa para mañana sábado a las 9pm para 3 personas, contacto 611223344"
}
```
**Esperado:** Bot procesa y confirma

---

## FLUJO 3: Consultas y Información

### Test 3.1: Consultar horarios
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "qué horarios tienen?"
}
```
**Esperado:** Bot responde con horarios

---

### Test 3.2: Consultar disponibilidad
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "hay disponibilidad para el domingo?"
}
```
**Esperado:** Bot informa sobre disponibilidad

---

## FLUJO 4: Cancelaciones

### Test 4.1: Cancelar reserva
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "quiero cancelar mi reserva"
}
```
**Esperado:** Bot responde sobre cancelación

---

## FLUJO 5: Detección por Capas

### Test 5.1: Capa 1 - Keywords (debe ser muy rápido)
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "reservar mesa"
}
```
**Esperado:** Alta confianza, respuesta rápida (Capa 1)

---

### Test 5.2: Capa 2 - Similarity (texto similar a ejemplos)
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "busco mesa para el sábado"
}
```
**Esperado:** Media confianza (Capa 2)

---

### Test 5.3: Capa 3 - OpenAI (texto ambiguo)
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "me gustaría comer este viernes en la noche con mi familia"
}
```
**Esperado:** OpenAI procesa y extrae intención (Capa 3)

---

## FLUJO 6: Mensajes sin Intención Clara

### Test 6.1: Mensaje genérico
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "cómo están?"
}
```
**Esperado:** Bot pide aclaración

---

## FLUJO 7: Múltiples Conversaciones Paralelas

### Test 7.1: Usuario 1 - Conversación independiente
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "hola, quiero reservar"
}
```

### Test 7.2: Usuario 2 - Conversación independiente (mismo tiempo)
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "aee44ff7-29dc-4012-9783-8539e59774ab",
  "message": "buenos días, consultar horarios"
}
```
**Esperado:** Cada usuario mantiene su contexto independiente en Redis

---

## FLUJO 8: Validación de Disponibilidad

### Test 8.1: Reserva en horario válido
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "reservar mesa para mañana a las 14:00 para 2 personas, teléfono 612345678"
}
```
**Esperado:** Confirma si hay disponibilidad

---

### Test 8.2: Reserva en horario fuera de servicio (debe fallar)
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "reservar mesa para mañana a las 23:30 para 2 personas, teléfono 612345678"
}
```
**Esperado:** Informa que está fuera del horario de atención

---

## FLUJO 9: Diferentes Formas de Expresar la Misma Intención

### Test 9.1: Reservar - Variación 1
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "necesito una mesa"
}
```

### Test 9.2: Reservar - Variación 2
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "quiero hacer una reserva"
}
```

### Test 9.3: Reservar - Variación 3
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "tengo una cita para mañana"
}
```

---

## FLUJO 10: Casos Edge y Errores

### Test 10.1: Mensaje vacío o muy corto
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "si"
}
```

### Test 10.2: Mensaje con muchos datos mezclados
```json
{
  "companyId": "12f242a4-216a-4a1f-8f59-e924b46b8959",
  "userId": "8164b55f-9495-41f4-b2ee-4cb84eeffcdf",
  "message": "hola quiero reservar para el 25 de diciembre navidad a las 8pm noche para 5 personas incluyendo niños mi teléfono es 611223344 y mi nombre es Juan"
}
```

---

## Checklist de Validación

Para cada test, verificar:

✅ **Respuesta JSON válida** con estos campos:
- `reply`: Texto de respuesta del bot
- `intention`: Intención detectada (reservar, cancelar, consultar, saludar, otro)
- `confidence`: Número entre 0.0 y 1.0
- `missingFields`: Array de campos faltantes (si aplica)
- `conversationState`: Estado de la conversación (idle, collecting, completed)

✅ **Lógica de negocio:**
- Las reservas se crean en la base de datos
- El contexto se guarda en Redis entre mensajes
- Las 3 capas funcionan correctamente
- La disponibilidad se valida correctamente

✅ **Performance:**
- Capa 1 (keywords): Muy rápido (< 100ms)
- Capa 2 (similarity): Medio (~100-500ms)
- Capa 3 (OpenAI): Más lento (~1-3s)

---

## Orden Recomendado de Pruebas

1. **Empezar con Flujo 1** (conversación paso a paso) - Prueba completa
2. **Flujo 2** (reserva en un mensaje) - Prueba OpenAI
3. **Flujo 5** (detección por capas) - Verificar que funcionan las 3 capas
4. **Flujo 3, 4** (consultas y cancelaciones) - Probar otras intenciones
5. **Flujo 7** (múltiples usuarios) - Verificar Redis
6. **Flujo 8** (validación) - Probar lógica de disponibilidad
7. **Flujos 9, 10** (edge cases) - Casos especiales

---

## Notas Importantes

- **Mismo userId = misma conversación**: Usa el mismo `userId` para continuar una conversación
- **Diferente userId = conversación nueva**: Cada usuario tiene su propio contexto
- **Fecha de prueba**: Usa fechas futuras (mañana, día específico) para las reservas
- **Formato de fecha/hora**: El bot intenta extraer de texto natural, pero OpenAI puede ayudar

