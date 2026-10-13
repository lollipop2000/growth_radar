-- AlterTable
ALTER TABLE "ScanPage" ADD COLUMN     "contentSignalsJson" JSONB,
ADD COLUMN     "internalLinksJson" JSONB;

-- AlterTable
ALTER TABLE "WebmasterQueryDaily" ADD COLUMN     "importId" TEXT,
ADD COLUMN     "normalizedQuery" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEBMASTER_API',
ALTER COLUMN "jobRunId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SeoAction" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "actionId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "expectedMetric" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "b2b" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "implementedAt" TIMESTAMP(3),
    "comment" TEXT,
    "baselineJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageChange" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "scanPageId" TEXT NOT NULL,
    "previousScanPageId" TEXT NOT NULL,
    "diffJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoAction_siteId_isCurrent_status_idx" ON "SeoAction"("siteId", "isCurrent", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeoAction_siteId_pageId_actionId_periodFrom_periodTo_key" ON "SeoAction"("siteId", "pageId", "actionId", "periodFrom", "periodTo");

-- CreateIndex
CREATE UNIQUE INDEX "PageChange_scanPageId_key" ON "PageChange"("scanPageId");

-- CreateIndex
CREATE INDEX "PageChange_pageId_createdAt_idx" ON "PageChange"("pageId", "createdAt");

-- AddForeignKey
ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "WebmasterQueryDaily_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAction" ADD CONSTRAINT "SeoAction_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAction" ADD CONSTRAINT "SeoAction_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAction" ADD CONSTRAINT "SeoAction_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageChange" ADD CONSTRAINT "PageChange_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
