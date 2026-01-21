-- CreateTable
CREATE TABLE "service_keywords" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "serviceKey" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'contains',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "language" TEXT NOT NULL DEFAULT 'es',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_keywords_serviceKey_idx" ON "service_keywords"("serviceKey");

-- CreateIndex
CREATE INDEX "service_keywords_companyId_idx" ON "service_keywords"("companyId");

-- CreateIndex
CREATE INDEX "service_keywords_keyword_idx" ON "service_keywords"("keyword");

-- CreateIndex
CREATE INDEX "service_keywords_active_idx" ON "service_keywords"("active");

-- AddForeignKey
ALTER TABLE "service_keywords" ADD CONSTRAINT "service_keywords_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
