ALTER TABLE "WebmasterQueryDaily" ADD COLUMN "grain" TEXT NOT NULL DEFAULT 'DAY', ADD COLUMN "periodMonth" TEXT, ADD COLUMN "demand" DOUBLE PRECISION;
ALTER TABLE "Import" ADD COLUMN "searchSummaryJson" JSONB;
ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "search_grain_period_check" CHECK (("grain" = 'DAY' AND "periodMonth" IS NULL) OR ("grain" = 'MONTH' AND "periodMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "periodMonth" = to_char("date", 'YYYY-MM') AND EXTRACT(DAY FROM "date") = 1));
CREATE INDEX "WebmasterQueryDaily_siteId_grain_periodMonth_idx" ON "WebmasterQueryDaily"("siteId", "grain", "periodMonth");
