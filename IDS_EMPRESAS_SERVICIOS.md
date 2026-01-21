# IDs de Empresas y Configuración de Servicios

## Cómo Obtener los IDs Reales

Después de ejecutar `npm run seed` o `npx prisma db seed`, los IDs se generan automáticamente. Para obtenerlos:

1. **Opción 1: Ver en la consola al ejecutar el seed**
   - El seed imprime: `✅ Empresa creada: [Nombre] ([ID])`
   - Copia esos IDs

2. **Opción 2: Consultar la base de datos**
   ```sql
   SELECT id, name, type FROM companies WHERE active = true;
   ```

3. **Opción 3: Usar el endpoint de la API**
   ```bash
   GET http://localhost:3000/companies
   ```

---

## Empresas Configuradas en el Seed

### 1. Restaurante La Pasta
- **Tipo:** `restaurant`
- **Servicios disponibles:**
  - `mesa`: Mesa en restaurante (sin pago anticipado, sin productos)
  - `domicilio`: Servicio a domicilio (con pago anticipado, requiere productos, envío $5.000, mínimo $20.000)
- **Productos:** Pizzas, Pastas, Bebidas, Postres
- **Horarios:** Lunes-Domingo 12:00-22:00 (Viernes-Sábado hasta 23:00)

### 2. Clínica Dental Sonrisas
- **Tipo:** `clinic`
- **Servicios disponibles:**
  - `limpieza`: Limpieza dental
  - `consulta`: Consulta general
  - `ortodoncia`: Ortodoncia
  - `blanqueamiento`: Blanqueamiento dental
- **Tratamientos:** Limpieza, Consulta, Ortodoncia, Blanqueamiento
- **Horarios:** Lunes-Viernes 09:00-19:00, Sábado 10:00-14:00, Domingo cerrado

---

## IDs para Usar en Pruebas

**IMPORTANTE:** Reemplaza estos IDs con los IDs reales después de ejecutar el seed:

### Restaurante La Pasta
```
Company ID: d7ee0f53-4823-4a60-8421-58948e5ac5b5 ✅
```

### Clínica Dental Sonrisas
```
Company ID: f259d74c-841e-44a4-b6bb-fa622c2498d2 ✅
```

### Usuarios de Prueba
```
User ID 1: d9155265-a393-4ce2-a00b-e1cedec0ba36 (Juan Pérez - tel: 612345678) ✅
User ID 2: c57b469a-bb1b-4e4a-b7da-75dd376c1374 (María García - tel: 698765432) ✅
User ID 3: e78db803-0e9e-4b5a-bfb1-056dfd5fb32e (Carlos López - tel: 611223344) ✅
```

---

## Configuración de Servicios

### Restaurante - Servicio "domicilio"
- **Key:** `domicilio`
- **Sinónimos detectados:**
  - "pedir a domicilio"
  - "domicilio"
  - "delivery"
  - "a domicilio"
  - "envío"
  - "pedido a domicilio"
  - "quiero un domicilio"
  - "necesito un domicilio"
  - "un domicilio"
  - "domicilio para"

### Restaurante - Servicio "mesa"
- **Key:** `mesa`
- **Sinónimos detectados:**
  - "mesa"
  - "reservar mesa"
  - "en el restaurante"
  - "comer aquí"
  - "mesa en restaurante"
  - "quiero una mesa"

---

## Verificación de Servicios

Para verificar que los servicios están configurados correctamente:

```bash
# Ver configuración de una empresa
GET http://localhost:3000/companies/[COMPANY_ID]
```

El campo `config.services` debe contener:
```json
{
  "mesa": {
    "enabled": true,
    "name": "Mesa en restaurante",
    ...
  },
  "domicilio": {
    "enabled": true,
    "name": "Servicio a domicilio",
    ...
  }
}
```

