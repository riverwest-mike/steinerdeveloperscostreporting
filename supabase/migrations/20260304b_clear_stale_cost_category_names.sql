-- Clear cost_category_name on transactions that have no cost_category_code.
-- These rows accumulated vendor names in cost_category_name from an old sync.
-- Without a code the name is meaningless for matching and causes confusing
-- "vendor as category name" display in the cost management report.
UPDATE appfolio_transactions
SET cost_category_name = NULL
WHERE cost_category_code IS NULL
  AND cost_category_name IS NOT NULL;
