-- Fix submitted_date column in loan_appeals:
-- 1. Drop the NOT NULL constraint so existing rows with null are not blocked
-- 2. Set a DB-level default of NOW() so new inserts without an explicit value get the current timestamp
ALTER TABLE loan_appeals ALTER COLUMN submitted_date DROP NOT NULL;
ALTER TABLE loan_appeals ALTER COLUMN submitted_date SET DEFAULT NOW();

-- Back-fill any existing null values with the created_at timestamp (best approximation)
UPDATE loan_appeals SET submitted_date = created_at WHERE submitted_date IS NULL;
