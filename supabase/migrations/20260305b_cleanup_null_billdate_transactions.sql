-- Remove AppFolio transactions that have no bill_date.
-- These are intraday / pending entries that AppFolio returned before they were
-- fully posted. They have no project_cost_category and therefore no
-- cost_category_code, causing "AppFolio — Unmatched Costs" to appear on every
-- report regardless of the selected date.
--
-- Legitimate posted transactions always have a bill_date in AppFolio.
-- Run this once in the Supabase SQL Editor to clear previously-synced artifacts.

DELETE FROM appfolio_transactions
WHERE bill_date IS NULL;

-- Also remove any transactions dated today that lack a cost category
-- (intraday records that slipped through before the sync date-cap fix).
DELETE FROM appfolio_transactions
WHERE bill_date = CURRENT_DATE
  AND cost_category_code IS NULL;
