-- Populate the derived field only; retain raw query and analytical identity.
UPDATE "WebmasterQueryDaily"
SET "normalizedQuery" = regexp_replace(replace(lower(trim("query")), 'ё', 'е'), '\s+', ' ', 'g')
WHERE "normalizedQuery" = '';
