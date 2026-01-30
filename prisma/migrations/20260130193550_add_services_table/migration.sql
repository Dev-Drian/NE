/*
  Warnings:

  - Made the column `confidence` on table `conversation_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `matchedPatterns` on table `conversation_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `extractedEntities` on table `conversation_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `success` on table `conversation_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `totalReservations` on table `user_preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `totalOrders` on table `user_preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `favoriteProducts` on table `user_preferences` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "conversation_logs" ALTER COLUMN "confidence" SET NOT NULL,
ALTER COLUMN "matchedPatterns" SET NOT NULL,
ALTER COLUMN "extractedEntities" SET NOT NULL,
ALTER COLUMN "success" SET NOT NULL;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "totalReservations" SET NOT NULL,
ALTER COLUMN "totalOrders" SET NOT NULL,
ALTER COLUMN "favoriteProducts" SET NOT NULL;

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredFields" TEXT[],
    "optionalFields" TEXT[],
    "allowedProductCategories" TEXT[],
    "config" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "basePrice" DOUBLE PRECISION,
    "keywords" TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "services_companyId_active_idx" ON "services"("companyId", "active");

-- CreateIndex
CREATE INDEX "services_companyId_available_idx" ON "services"("companyId", "available");

-- CreateIndex
CREATE UNIQUE INDEX "services_companyId_key_key" ON "services"("companyId", "key");

-- CreateIndex
CREATE INDEX "reservations_serviceId_idx" ON "reservations"("serviceId");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
