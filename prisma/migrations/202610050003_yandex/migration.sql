-- CreateTable
CREATE TABLE "MetrikaPageDaily" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT,
    "date" DATE NOT NULL,
    "counterId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchReason" TEXT,
    "visits" DOUBLE PRECISION NOT NULL,
    "visitors" DOUBLE PRECISION NOT NULL,
    "pageviews" DOUBLE PRECISION NOT NULL,
    "bounceRate" DOUBLE PRECISION,
    "avgVisitDuration" DOUBLE PRECISION,
    "goalConversionsJson" JSONB NOT NULL DEFAULT '{}',
    "granularity" TEXT NOT NULL DEFAULT 'LANDING_PAGE_SESSION',
    "reportMetaJson" JSONB NOT NULL DEFAULT '{}',
    "rawJson" JSONB NOT NULL DEFAULT '{}',
    "jobRunId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetrikaPageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebmasterQueryDaily" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT,
    "date" DATE NOT NULL,
    "hostId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "region" TEXT,
    "rowKey" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchReason" TEXT,
    "impressions" DOUBLE PRECISION NOT NULL,
    "clicks" DOUBLE PRECISION NOT NULL,
    "avgPosition" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "rawJson" JSONB NOT NULL DEFAULT '{}',
    "jobRunId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebmasterQueryDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsSaved" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "checkpointJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetrikaPageDaily_siteId_date_pageId_idx" ON "MetrikaPageDaily"("siteId", "date", "pageId");

-- CreateIndex
CREATE INDEX "MetrikaPageDaily_siteId_matchStatus_date_idx" ON "MetrikaPageDaily"("siteId", "matchStatus", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetrikaPageDaily_siteId_counterId_date_rowKey_key" ON "MetrikaPageDaily"("siteId", "counterId", "date", "rowKey");

-- CreateIndex
CREATE INDEX "WebmasterQueryDaily_siteId_date_pageId_idx" ON "WebmasterQueryDaily"("siteId", "date", "pageId");

-- CreateIndex
CREATE INDEX "WebmasterQueryDaily_siteId_matchStatus_date_idx" ON "WebmasterQueryDaily"("siteId", "matchStatus", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WebmasterQueryDaily_siteId_hostId_date_rowKey_key" ON "WebmasterQueryDaily"("siteId", "hostId", "date", "rowKey");

-- CreateIndex
CREATE INDEX "JobRun_status_nextAttemptAt_idx" ON "JobRun"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "JobRun_integrationId_createdAt_idx" ON "JobRun"("integrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "MetrikaPageDaily" ADD CONSTRAINT "MetrikaPageDaily_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetrikaPageDaily" ADD CONSTRAINT "MetrikaPageDaily_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetrikaPageDaily" ADD CONSTRAINT "MetrikaPageDaily_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "WebmasterQueryDaily_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "WebmasterQueryDaily_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "WebmasterQueryDaily_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
