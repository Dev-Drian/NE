# Implementación: Keywords Escalables en Base de Datos

## ✅ Lo que se implementó

### 1. Base de Datos
- ✅ Nueva tabla `ServiceKeyword` en Prisma
- ✅ Migración aplicada: `20260121015041_add_service_keywords`
- ✅ Campos: `serviceKey`, `keyword`, `type`, `weight`, `companyId` (opcional)

### 2. Servicio de Keywords
- ✅ `KeywordsService` con cache en memoria
- ✅ Cache se refresca cada 5 minutos
- ✅ Búsqueda rápida por keywords
- ✅ Soporte para keywords globales y por empresa

### 3. Integración en Bot Engine
- ✅ **Nueva CAPA 0**: Keywords desde BD (antes de las otras capas)
- ✅ Si encuentra match con confianza >= 0.8, usa el keyword
- ✅ Si no encuentra, continúa con el flujo normal (IA como fallback)
- ✅ **No rompe nada existente** - funciona como capa adicional

### 4. Seed con Keywords
- ✅ 30+ keywords globales migrados a BD
- ✅ Keywords para servicios: `domicilio`, `mesa`
- ✅ Keywords de exclusión: "no quiero que me lo traigan" → cambia a `mesa`

## 🎯 Flujo de Detección Mejorado

```
Mensaje del Usuario
    ↓
CAPA 0: Keywords desde BD (NUEVO) ⚡
    ├─ Match encontrado (confianza >= 0.8)?
    │   ├─ SÍ → Usar servicio del keyword + OpenAI para otros datos
    │   └─ NO → Continuar con flujo normal
    ↓
CAPA 1: Keywords hardcodeados (existente)
    ↓
CAPA 2: Similarity (existente)
    ↓
CAPA 3: OpenAI (existente - fallback inteligente)
```

## 📊 Ventajas

1. **Escalable**: Agregar keywords sin tocar código
2. **Rápido**: Cache en memoria, BD solo para refresco
3. **Flexible**: Keywords por empresa o globales
4. **Inteligente**: IA como fallback para casos nuevos
5. **Económico**: Keywords primero (gratis), IA solo cuando es necesario
6. **Mantenible**: Sin tocar código para agregar keywords

## 🔧 Cómo Agregar Nuevos Keywords

### Opción 1: Directamente en BD
```sql
INSERT INTO service_keywords (service_key, keyword, type, weight, company_id, language, active)
VALUES ('domicilio', 'nuevo keyword', 'contains', 0.9, NULL, 'es', true);
```

### Opción 2: En el Seed
```typescript
await prisma.serviceKeyword.create({
  data: {
    serviceKey: 'domicilio',
    keyword: 'nuevo keyword',
    type: 'contains',
    weight: 0.9,
    companyId: null, // Global
    language: 'es',
    active: true,
  },
});
```

### Opción 3: API (futuro)
Crear endpoint para administrar keywords desde UI.

## 📝 Keywords Actuales en BD

### Servicio: `domicilio`
- pedir a domicilio
- domicilio
- delivery
- a domicilio
- envío
- pedido a domicilio
- quiero un domicilio
- necesito un domicilio
- un domicilio
- pedir domicilio
- domicilio para
- que me lo traigan
- que me lo lleven

### Servicio: `mesa`
- mesa
- restaurante
- comer aquí
- en el restaurante
- reservar mesa
- mesa en restaurante
- quiero una mesa
- para llevar
- pedir para llevar
- llevar
- take away
- recoger
- pasar a recoger
- no quiero que me lo traigan
- no quiero que me la traigan
- no quiero domicilio
- no quiero delivery

## 🚀 Próximos Pasos (Opcional)

1. **UI de Administración**: Crear endpoint/admin para gestionar keywords
2. **Analytics**: Trackear qué keywords se usan más
3. **Auto-aprendizaje**: Guardar nuevos keywords detectados por IA
4. **Multi-idioma**: Soporte para keywords en otros idiomas

## ⚠️ Notas Importantes

- El código hardcodeado **sigue funcionando** como fallback
- Los keywords de BD tienen **prioridad** cuando hay match
- Si no hay match en BD, el flujo normal continúa
- **No se rompió nada existente** - es una mejora incremental

