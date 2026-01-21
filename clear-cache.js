// Script para limpiar el cache de Redis
const Redis = require('ioredis');

async function clearCache() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl);

  try {
    console.log('🗑️ Limpiando cache de Redis...\n');
    
    // Obtener todas las keys de conversación
    const keys = await redis.keys('conversation:*');
    
    if (keys.length === 0) {
      console.log('✅ No hay conversaciones en cache');
    } else {
      console.log(`📋 Encontradas ${keys.length} conversaciones en cache`);
      
      // Mostrar las keys antes de borrar
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const context = JSON.parse(data);
          console.log(`   - ${key}: stage=${context.stage}, lastIntention=${context.lastIntention || 'none'}`);
        }
      }
      
      // Borrar todas las keys
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`\n✅ ${keys.length} conversaciones eliminadas del cache`);
      }
    }
    
    // También limpiar todo si se pasa --all
    if (process.argv.includes('--all')) {
      await redis.flushall();
      console.log('✅ Todo el cache de Redis ha sido limpiado');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redis.disconnect();
    console.log('\n✅ Conexión cerrada');
  }
}

clearCache();
