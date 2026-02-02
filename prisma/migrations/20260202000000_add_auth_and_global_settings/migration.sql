-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER');

-- CreateTable: admins
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'COMPANY_ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "refreshToken" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable: global_settings
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "jwtSecret" TEXT,
    "jwtExpiresIn" TEXT NOT NULL DEFAULT '7d',
    "openaiApiKey" TEXT,
    "geminiApiKey" TEXT,
    "defaultAiProvider" TEXT NOT NULL DEFAULT 'openai',
    "whatsappToken" TEXT,
    "whatsappPhoneId" TEXT,
    "whatsappVerifyToken" TEXT,
    "wompiPublicKey" TEXT,
    "wompiPrivateKey" TEXT,
    "wompiEventsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable: companies - Add new columns with defaults for existing data
ALTER TABLE "companies" ADD COLUMN "address" TEXT;
ALTER TABLE "companies" ADD COLUMN "email" TEXT;
ALTER TABLE "companies" ADD COLUMN "geminiApiKey" TEXT;
ALTER TABLE "companies" ADD COLUMN "logo" TEXT;
ALTER TABLE "companies" ADD COLUMN "openaiApiKey" TEXT;
ALTER TABLE "companies" ADD COLUMN "preferredAiProvider" TEXT;

-- Add slug column (temporary nullable)
ALTER TABLE "companies" ADD COLUMN "slug" TEXT;

-- Update existing companies with slugs based on their name
UPDATE "companies" SET "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || SUBSTRING(id, 1, 8);

-- Make slug NOT NULL and unique after populating
ALTER TABLE "companies" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE INDEX "admins_email_idx" ON "admins"("email");
CREATE INDEX "admins_companyId_idx" ON "admins"("companyId");
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
