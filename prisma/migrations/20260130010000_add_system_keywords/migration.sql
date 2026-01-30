-- CreateTable
CREATE TABLE "system_keywords" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'contains',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "language" TEXT NOT NULL DEFAULT 'es',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_keywords_category_idx" ON "system_keywords"("category");

-- CreateIndex
CREATE INDEX "system_keywords_active_idx" ON "system_keywords"("active");

-- CreateIndex
CREATE INDEX "system_keywords_language_idx" ON "system_keywords"("language");

-- CreateIndex (unique constraint)
CREATE UNIQUE INDEX "system_keywords_category_keyword_language_key" ON "system_keywords"("category", "keyword", "language");
