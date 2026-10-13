-- CreateTable
CREATE TABLE "ImportProfile" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "mappingJson" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'ISO',
    "numericFormat" TEXT NOT NULL DEFAULT 'RU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "profileId" TEXT,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sheetName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsErrors" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "dataJson" JSONB NOT NULL DEFAULT '{}',
    "mappingJson" JSONB NOT NULL DEFAULT '{}',
    "errorsJson" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRecord" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "pageId" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "rawUrl" TEXT,
    "normalizedUrl" TEXT,
    "sku" TEXT,
    "productName" TEXT,
    "category" TEXT,
    "productGroup" TEXT,
    "brand" TEXT,
    "price" DECIMAL(18,4),
    "stock" DOUBLE PRECISION,
    "available" BOOLEAN,
    "package" TEXT,
    "priority" DOUBLE PRECISION,
    "date" DATE,
    "orders" DOUBLE PRECISION,
    "quantityKg" DOUBLE PRECISION,
    "revenue" DECIMAL(18,4),
    "attributesJson" JSONB NOT NULL DEFAULT '{}',
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "scoreBreakdownJson" JSONB NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportProfile_siteId_name_key" ON "ImportProfile"("siteId", "name");

-- CreateIndex
CREATE INDEX "Import_siteId_createdAt_idx" ON "Import"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessRecord_siteId_pageId_date_idx" ON "BusinessRecord"("siteId", "pageId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecord_importId_rowNumber_key" ON "BusinessRecord"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "Opportunity_siteId_isCurrent_status_score_idx" ON "Opportunity"("siteId", "isCurrent", "status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_siteId_pageId_ruleId_periodFrom_periodTo_key" ON "Opportunity"("siteId", "pageId", "ruleId", "periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "ImportProfile" ADD CONSTRAINT "ImportProfile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ImportProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
