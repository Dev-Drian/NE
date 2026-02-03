-- DropIndex
DROP INDEX "categories_companyId_key_entityType_key";

-- CreateIndex
CREATE INDEX "categories_key_entityType_idx" ON "categories"("key", "entityType");
