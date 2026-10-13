ALTER TABLE "WebmasterQueryDaily" ADD CONSTRAINT "search_month_required" CHECK ("grain" <> 'MONTH' OR "periodMonth" IS NOT NULL);
