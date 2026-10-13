ALTER TABLE "Import" ADD COLUMN "salesImportMode" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "coverageFrom" DATE, ADD COLUMN "coverageTo" DATE,
  ADD COLUMN "metadataUpdatedAt" TIMESTAMP(3);
ALTER TABLE "ImportProfile" ADD COLUMN "salesImportMode" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "BusinessRecord" ADD COLUMN "kgPerUnit" DECIMAL(18,6);
ALTER TABLE "Import" ADD CONSTRAINT "Import_sales_mode_check" CHECK ("salesImportMode" IN ('UNKNOWN','PARTIAL','TRANSACTIONAL'));
ALTER TABLE "Import" ADD CONSTRAINT "Import_sales_coverage_check" CHECK (
  ("coverageFrom" IS NULL AND "coverageTo" IS NULL AND "salesImportMode" <> 'TRANSACTIONAL') OR
  ("coverageFrom" IS NOT NULL AND "coverageTo" IS NOT NULL AND "coverageFrom" <= "coverageTo"));
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_kgPerUnit_positive" CHECK ("kgPerUnit" IS NULL OR "kgPerUnit" > 0);
