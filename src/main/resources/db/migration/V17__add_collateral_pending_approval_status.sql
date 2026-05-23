-- V17: No migration needed for collateral PENDING_APPROVAL status.
-- The collateral.status column was converted to plain TEXT in V7,
-- so new status values like 'PENDING_APPROVAL' can be stored without
-- any ALTER TYPE command. This file is intentionally a no-op.
SELECT 1;
