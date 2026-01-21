# 🔧 Solución: Puerto 3030 en Uso

## ❌ Problema

Error: `EADDRINUSE: address already in use :::3030`

El puerto 3030 ya está siendo usado por otro proceso.

---

## ✅ Solución

### Opción 1: Detener el Proceso (Recomendado)

**En Windows (PowerShell o CMD):**
```bash
# 1. Encontrar el proceso usando el puerto 3030
netstat -ano | findstr :3030

# 2. Detener el proceso (reemplaza PID con el número que aparezca)
taskkill /F /PID [PID]

# Ejemplo:
taskkill /F /PID 25388
```

**En Git Bash:**
```bash
# Encontrar proceso
netstat -ano | findstr :3030

# Detener proceso (usar cmd.exe)
cmd.exe /c "taskkill /F /PID [PID]"
```

### Opción 2: Usar el Servidor que Ya Está Corriendo

Si el servidor ya está funcionando, puedes usarlo directamente:
```bash
# Verificar que funciona
curl http://localhost:3030

# Si responde (incluso con 404), el servidor está funcionando
# Solo continúa usando el servidor existente
```

### Opción 3: Cambiar el Puerto (Alternativa)

Si no puedes detener el proceso, puedes cambiar el puerto:

1. Edita `.env` y cambia:
```env
PORT=3031
```

2. O modifica `src/main.ts`:
```typescript
const port = process.env.PORT || 3031; // Cambiar de 3030 a 3031
```

---

## 🔍 Verificar el Estado

### Ver si el servidor está corriendo
```bash
curl http://localhost:3030
```

**Si responde:** El servidor está funcionando, usa ese servidor.  
**Si no responde:** El proceso está bloqueando el puerto, detén el proceso.

### Ver todos los procesos Node.js
```bash
tasklist | findstr node
```

### Verificar puerto específico
```bash
netstat -ano | findstr :3030
```

---

## 📝 Nota

Si el servidor ya está corriendo y funciona correctamente, **NO necesitas reiniciarlo**. Solo continúa usando las requests en Postman con ese servidor.

---

**Última actualización:** 2026-01-20


