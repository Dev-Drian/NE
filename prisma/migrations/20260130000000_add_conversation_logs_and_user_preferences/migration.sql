-- ============================================
-- MIGRACIÓN: Logs de conversación + Preferencias de usuario
-- Fecha: 2026-01-30
-- Objetivo: Métricas avanzadas y memoria a largo plazo
-- ============================================

-- 1. TABLA DE LOGS DE CONVERSACIÓN (para métricas y análisis)
CREATE TABLE "conversation_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT,
    
    -- Mensaje original
    "userMessage" TEXT NOT NULL,
    "normalizedMessage" TEXT,
    
    -- Detección de intención
    "detectedIntention" TEXT,
    "confidence" DOUBLE PRECISION DEFAULT 0,
    "detectionLayer" TEXT, -- 'layer1', 'layer2', 'layer3', 'keyword'
    "matchedPatterns" JSONB DEFAULT '[]',
    
    -- Entidades extraídas
    "extractedEntities" JSONB DEFAULT '{}',
    
    -- Resultado
    "botResponse" TEXT,
    "actionExecuted" TEXT, -- 'create_reservation', 'cancel', 'query', etc.
    "success" BOOLEAN DEFAULT true,
    "errorType" TEXT, -- 'not_understood', 'validation_error', 'system_error'
    
    -- Contexto
    "conversationState" TEXT,
    "previousIntention" TEXT,
    
    -- Métricas de rendimiento
    "responseTimeMs" INTEGER,
    
    -- Timestamps
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_logs_pkey" PRIMARY KEY ("id")
);

-- 2. TABLA DE PREFERENCIAS DE USUARIO (memoria a largo plazo)
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    
    -- Preferencias aprendidas
    "preferredService" TEXT, -- Servicio más usado
    "preferredTime" TEXT, -- Hora preferida (ej: "19:00")
    "preferredDay" TEXT, -- Día preferido (ej: "saturday")
    "defaultGuests" INTEGER, -- Número usual de personas
    "defaultAddress" TEXT, -- Dirección de entrega guardada
    
    -- Datos personales confirmados
    "confirmedName" TEXT,
    "confirmedPhone" TEXT,
    "confirmedEmail" TEXT,
    
    -- Historial resumido
    "totalReservations" INTEGER DEFAULT 0,
    "totalOrders" INTEGER DEFAULT 0,
    "lastVisitDate" TIMESTAMP(3),
    "favoriteProducts" JSONB DEFAULT '[]', -- IDs de productos más pedidos
    
    -- Notas del sistema
    "notes" TEXT, -- Notas automáticas o del operador
    
    -- Timestamps
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- 3. ÍNDICES PARA BÚSQUEDAS EFICIENTES
CREATE INDEX "conversation_logs_userId_idx" ON "conversation_logs"("userId");
CREATE INDEX "conversation_logs_companyId_idx" ON "conversation_logs"("companyId");
CREATE INDEX "conversation_logs_detectedIntention_idx" ON "conversation_logs"("detectedIntention");
CREATE INDEX "conversation_logs_success_idx" ON "conversation_logs"("success");
CREATE INDEX "conversation_logs_createdAt_idx" ON "conversation_logs"("createdAt");
CREATE INDEX "conversation_logs_errorType_idx" ON "conversation_logs"("errorType");

CREATE UNIQUE INDEX "user_preferences_userId_companyId_key" ON "user_preferences"("userId", "companyId");
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");
CREATE INDEX "user_preferences_companyId_idx" ON "user_preferences"("companyId");

-- 4. FOREIGN KEYS
ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
