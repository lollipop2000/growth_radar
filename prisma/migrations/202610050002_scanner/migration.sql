-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "aliasesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "latestScanPageId" TEXT,
ADD COLUMN     "manualType" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pageType" TEXT NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "configJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "discoveryErrorsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'HTTP';

-- AlterTable
ALTER TABLE "ScanPage" ADD COLUMN     "canonical" TEXT,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "contentLength" INTEGER,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "externalLinksCount" INTEGER,
ADD COLUMN     "finalUrl" TEXT,
ADD COLUMN     "h1" TEXT,
ADD COLUMN     "h2Json" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "httpStatusCode" INTEGER,
ADD COLUMN     "indexable" BOOLEAN,
ADD COLUMN     "internalLinksCount" INTEGER,
ADD COLUMN     "lang" TEXT,
ADD COLUMN     "openGraphJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'OK',
ADD COLUMN     "redirectsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "requestedUrl" TEXT,
ADD COLUMN     "robots" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'HTTP',
ADD COLUMN     "structuredDataJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "wordCount" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Page_latestScanPageId_key" ON "Page"("latestScanPageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_latestScanPageId_fkey" FOREIGN KEY ("latestScanPageId") REFERENCES "ScanPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
