# 🛠️ Comandos Útiles - Guía Completa

Documento de referencia rápida con todos los comandos necesarios para trabajar con el proyecto.

---

## 📋 Índice Rápido

1. [Docker - Servicios](#docker---servicios)
2. [Base de Datos](#base-de-datos)
3. [Redis - Cache](#redis---cache)
4. [Servidor](#servidor)
5. [Consultar Datos](#consultar-datos)
6. [Prisma Studio](#prisma-studio)
7. [Reseteo Completo](#reseteo-completo)

---

## 🐳 Docker - Servicios

### Levantar todos los servicios (PostgreSQL + Redis)
```bash
docker-compose up -d
```

### Ver estado de los contenedores
```bash
docker-compose ps
```

### Ver logs en tiempo real
```bash
# Todos los servicios
docker-compose logs -f

# Solo PostgreSQL
docker-compose logs -f postgres

# Solo Redis
docker-compose logs -f redis
```

### Detener servicios (sin borrar datos)
```bash
docker-compose down
```

### Detener servicios Y borrar volúmenes ⚠️ BORRA TODO
```bash
docker-compose down -v
```

### Reiniciar servicios
```bash
docker-compose restart
```

### Acceder a PostgreSQL
```bash
docker exec -it bot-reservas-postgres psql -U postgres -d bot_reservas
```

### Acceder a Redis CLI
```bash
docker exec -it bot-reservas-redis redis-cli
```

---

## 💾 Base de Datos

### Resetear BD completamente (borra TODO y ejecuta seed)
```bash
npx prisma migrate reset --force
```

Este comando:
- ✅ Borra toda la base de datos
- ✅ Ejecuta las migraciones
- ✅ Ejecuta el seeder automáticamente
- ✅ Genera el `conversations-examples.json` con datos reales

### Solo ejecutar migraciones
```bash
npm run prisma:migrate
```

### Solo ejecutar seeder
```bash
npm run prisma:seed
```

### Generar cliente Prisma
```bash
npm run prisma:generate
```

### Abrir Prisma Studio (interfaz visual)
```bash
npm run prisma:studio
```

---

## 🔴 Redis - Cache

### Limpiar TODO el cache de Redis
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

### Ver todas las claves en Redis
```bash
docker exec bot-reservas-redis redis-cli KEYS "*"
```

### Ver solo conversaciones
```bash
docker exec bot-reservas-redis redis-cli KEYS "conversation:*"
```

### Ver una conversación específica
```bash
# Reemplazar userId y companyId con valores reales
docker exec bot-reservas-redis redis-cli GET "conversation:[userId]:[companyId]"
```

### Limpiar solo conversaciones
```bash
docker exec bot-reservas-redis redis-cli --eval - 0 <<EOF
local keys = redis.call('keys', 'conversation:*')
for i=1,#keys do
    redis.call('del', keys[i])
end
return #keys
EOF
```

### Reiniciar Redis (limpia todo)
```bash
docker-compose restart redis
```

---

## 🚀 Servidor

### Iniciar servidor en modo desarrollo
```bash
npm run start:dev
```

### Compilar proyecto
```bash
npm run build
```

### Iniciar servidor en modo producción
```bash
npm run start:prod
```

### Verificar que el servidor está corriendo
```bash
curl http://localhost:3030
```

---

## 📊 Consultar Datos

### Buscar empresas
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, name, type, phone FROM companies WHERE active = true;"
```

### Buscar usuarios
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, name, phone, email FROM users LIMIT 10;"
```

### Buscar reservas de un usuario
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, date, time, status, phone, guests, service FROM reservations WHERE phone = '612345678' ORDER BY created_at DESC LIMIT 10;"
```

### Buscar reservas canceladas
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, date, time, phone, updated_at FROM reservations WHERE status = 'cancelled' ORDER BY updated_at DESC LIMIT 10;"
```

### Contar reservas por estado
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT status, COUNT(*) as total FROM reservations GROUP BY status;"
```

### Buscar reservas de una empresa
```bash
# Reemplazar companyId con ID real
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, date, time, status, phone, guests FROM reservations WHERE \"companyId\" = '3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d' ORDER BY created_at DESC LIMIT 10;"
```

### Ver todas las intenciones
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, name, \"companyId\", priority FROM intentions ORDER BY priority DESC;"
```

### Buscar usuario por teléfono
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT id, name, phone, email FROM users WHERE phone = '612345678';"
```

---

## 🎨 Prisma Studio

### Abrir Prisma Studio
```bash
npm run prisma:studio
```

Esto abre una interfaz web en `http://localhost:5555` donde puedes:
- ✅ Ver todas las tablas
- ✅ Editar datos visualmente
- ✅ Crear nuevos registros
- ✅ Eliminar registros
- ✅ Filtrar y buscar

---

## 🔄 Reseteo Completo del Sistema

### Opción 1: Reseteo Total (Recomendado)
```bash
# 1. Detener servicios y borrar volúmenes
docker-compose down -v

# 2. Levantar servicios nuevamente
docker-compose up -d

# 3. Esperar a que PostgreSQL esté listo (10 segundos)
sleep 10

# 4. Resetear BD (ejecuta migraciones + seeder)
npx prisma migrate reset --force

# 5. Limpiar Redis
docker exec bot-reservas-redis redis-cli FLUSHALL

# 6. Iniciar servidor
npm run start:dev
```

### Opción 2: Solo BD (mantiene Docker)
```bash
# 1. Resetear BD
npx prisma migrate reset --force

# 2. Limpiar Redis
docker exec bot-reservas-redis redis-cli FLUSHALL
```

### Opción 3: Solo Redis
```bash
docker exec bot-reservas-redis redis-cli FLUSHALL
```

---

## 🧪 Pruebas Rápidas

### Probar que el servidor responde
```bash
curl http://localhost:3030
```

### Enviar mensaje al bot (saludo)
```bash
curl -X POST http://localhost:3030/messages \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
    "phone": "612345678",
    "message": "Hola"
  }'
```

### Ver respuesta formateada (requiere Python)
```bash
curl -X POST http://localhost:3030/messages \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d",
    "phone": "612345678",
    "message": "Hola"
  }' | python -m json.tool
```

---

## 📝 Comandos Útiles Adicionales

### Ver logs del servidor (si está corriendo con npm)
```bash
# Los logs aparecen directamente en la terminal donde ejecutaste npm run start:dev
```

### Verificar que PostgreSQL está listo
```bash
docker exec bot-reservas-postgres pg_isready -U postgres
```

### Verificar que Redis está listo
```bash
docker exec bot-reservas-redis redis-cli PING
```

### Ver tamaño de la BD
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT pg_size_pretty(pg_database_size('bot_reservas'));"
```

### Ver cantidad de registros en cada tabla
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "SELECT 'companies' as tabla, COUNT(*) as total FROM companies
   UNION ALL SELECT 'users', COUNT(*) FROM users
   UNION ALL SELECT 'reservations', COUNT(*) FROM reservations
   UNION ALL SELECT 'intentions', COUNT(*) FROM intentions
   UNION ALL SELECT 'conversations', COUNT(*) FROM conversations;"
```

### Exportar datos de reservas a CSV
```bash
docker exec bot-reservas-postgres psql -U postgres -d bot_reservas -c \
  "COPY (SELECT date, time, status, phone, guests, service FROM reservations) TO STDOUT WITH CSV HEADER" > reservas.csv
```

---

## 🔍 Solución de Problemas

### El servidor no inicia
```bash
# 1. Verificar que Docker está corriendo
docker-compose ps

# 2. Verificar logs
docker-compose logs postgres
docker-compose logs redis

# 3. Verificar que el puerto 3030 está disponible
netstat -ano | findstr :3030  # Windows
lsof -i :3030  # Linux/Mac
```

### PostgreSQL no está listo
```bash
# Esperar y verificar
sleep 5
docker exec bot-reservas-postgres pg_isready -U postgres

# Si no está listo, ver logs
docker-compose logs postgres
```

### Redis no responde
```bash
# Verificar
docker exec bot-reservas-redis redis-cli PING

# Si no responde, reiniciar
docker-compose restart redis
```

### Error de migraciones
```bash
# Resetear completamente
npx prisma migrate reset --force
```

### Error de Prisma Client
```bash
# Regenerar cliente
npm run prisma:generate
```

---

## 📚 Referencias

- **Servidor:** `http://localhost:3030`
- **Prisma Studio:** `http://localhost:5555`
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`

### IDs de Prueba (del seeder)

**Empresas:**
- Restaurante: `3f8e74ba-0002-42b8-8cb2-0c13e8a31b4d`
- Clínica: `f05c83f1-e88d-43c4-accf-5cea6e951792`

**Usuarios:**
- Juan Pérez: `612345678`
- María García: `698765432`
- Carlos López: `611223344`

---

**Última actualización:** 2026-01-20
