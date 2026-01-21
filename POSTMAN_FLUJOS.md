# 📮 Guía de Postman - Bot de Reservas

Cómo importar y usar la colección de Postman para probar todos los flujos.

---

## 📥 Importar Colección

1. Abre Postman
2. Click en **Import** (arriba izquierda)
3. Selecciona el archivo `postman_collection.json`
4. La colección aparecerá en tu workspace

---

## 🎯 Variables de la Colección

La colección incluye estas variables preconfiguradas:

- **`baseUrl`**: `http://localhost:3030`
- **`restaurantId`**: `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`
- **`clinicId`**: `f05c83f1-e88d-43c4-accf-5cea6e951792`
- **`phoneJuan`**: `612345678`
- **`phoneMaria`**: `698765432`
- **`phoneCarlos`**: `611223344`
- **`conversationId`**: Se llena automáticamente
- **`paymentId`**: Se llena automáticamente

### Editar Variables

1. Click en el nombre de la colección
2. Ve a la pestaña **Variables**
3. Edita los valores según necesites

---

## 🔄 Flujos Recomendados

### 🍽️ Flujo 1: Restaurante Completo

1. **Restaurante > 1. Saludo**
2. **Restaurante > 2. Consulta Menú**
3. **Restaurante > 3. Consulta Servicios**
4. **Restaurante > 4. Reserva Completa**

### 🦷 Flujo 2: Clínica con Pago

1. **Clínica > 1. Consulta Tratamientos**
2. **Clínica > 3. Agendar Cita**
3. **Clínica > 4. Completar Datos Cita**
4. **Pagos > 1. Crear Pago** (usa el `conversationId` de paso 3)
5. **Pagos > 2. Verificar Estado de Pago**

### 🗑️ Flujo 3: Cancelación

1. **Restaurante > 4. Reserva Completa** (crear reserva primero)
2. **Restaurante > 9. Cancelar Reservas**
3. **Restaurante > 10. Seleccionar Reserva por Número**

---

## ⚡ Scripts Automáticos

Algunas requests incluyen scripts que automáticamente:

- **Extraen `conversationId`** de las respuestas
- **Guardan `paymentId`** para usar en otras requests
- **Limpian variables** después de cada flujo

### Ver Variables en Consola

Para ver qué valores se están guardando:
1. Abre la **Console** de Postman (View > Show Postman Console)
2. Los scripts mostrarán los valores guardados

---

## 📋 Estructura de la Colección

```
Bot Reservas - Flujos de Prueba
├── 🔄 Limpiar Redis
├── 🍽️ Restaurante
│   ├── 1. Saludo
│   ├── 2. Consulta Menú
│   ├── 3. Consulta Servicios
│   ├── 4. Reserva Completa
│   ├── 5. Reserva Todo en Uno
│   ├── 6. Consulta Horarios
│   ├── 7. Servicio a Domicilio
│   ├── 8. Especificar Pedido Domicilio
│   ├── 9. Cancelar Reservas
│   └── 10. Seleccionar Reserva por Número
├── 🦷 Clínica
│   ├── 1. Consulta Tratamientos
│   ├── 2. Consulta Servicios
│   ├── 3. Agendar Cita
│   ├── 4. Completar Datos Cita
│   ├── 5. Cita Todo en Uno
│   ├── 6. Consulta Horarios
│   ├── 7. Cancelar Cita
│   ├── 8. Confirmar Cancelación
│   └── 9. Validación - Sin Reservas
├── 💳 Pagos - Clínica
│   ├── 1. Crear Pago
│   ├── 2. Verificar Estado de Pago
│   ├── 3. Ver Pagos de Conversación
│   ├── 4. Ver Pago Pendiente
│   └── 5. Webhook Wompi
└── 📊 Consultas - BD
    ├── Ver Empresas
    ├── Ver Empresa Restaurante
    ├── Ver Empresa Clínica
    ├── Ver Reservas
    └── Ver Intenciones
```

---

## 🎬 Ejecutar Flujos

### Ejecutar Request Individual

1. Selecciona la request
2. Click en **Send**
3. Ve la respuesta en la pestaña **Body**

### Ejecutar Carpeta Completa

1. Click derecho en una carpeta (ej: "Restaurante")
2. Click en **Run folder**
3. Configura el orden si es necesario
4. Click en **Run**

---

## 💡 Tips

1. **Siempre limpia Redis** entre flujos diferentes usando el comando manual
2. **Revisa las variables** después de cada request importante
3. **Usa la Console** para ver logs de los scripts
4. **Guarda las respuestas** que contengan `conversationId` para pagos

---

## 🔍 Verificar Respuestas

### Respuesta Exitosa de Mensaje
```json
{
  "reply": "...",
  "intention": "reservar",
  "confidence": 1,
  "conversationState": "completed",
  "conversationId": "uuid-aqui"
}
```

### Respuesta de Pago
```json
{
  "id": "payment-uuid",
  "amount": 80000,
  "status": "PENDING",
  "paymentUrl": "https://checkout.wompi.co/l/transaction-id",
  "wompiReference": "PAY-1234567890-abc123"
}
```

---

**📝 Nota:** Recuerda tener el servidor corriendo en `http://localhost:3030` antes de ejecutar las requests.


