-- V20: Savings account business rule enforcement
--
-- 1. Ensure non-regular saving accounts have the correct interest rate
--    (sync existing accounts to the current config rate).
--    The interest rate on non-regular accounts should always reflect the
--    current savings_interest_rate from system_configurations.
--
-- Note: This uses the latest config version's savings_interest_rate.
--       After this migration, the application will keep rates in sync
--       on every monthly interest run.

UPDATE accounts
SET interest_rate = (
    SELECT savings_interest_rate
    FROM system_configurations
    ORDER BY version DESC
    LIMIT 1
)
WHERE account_type = 'NON_REGULAR_SAVING'
  AND status = 'ACTIVE';

-- 2. Close any Regular Saving accounts belonging to WITHDRAWN members
--    (catches cases where withdrawal happened before this fix was deployed)
UPDATE accounts
SET status = 'CLOSED'
WHERE account_type = 'REGULAR_SAVING'
  AND status = 'ACTIVE'
  AND member_id IN (
      SELECT id FROM members WHERE status = 'WITHDRAWN'
  );
