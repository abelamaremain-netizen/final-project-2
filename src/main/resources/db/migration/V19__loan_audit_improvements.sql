-- V19: Loan module audit improvements
-- Adds missing audit fields for financial accuracy and audit trail integrity

-- 1. loan_repayments: add recorded_at (system timestamp), outstanding_balance_after, interest_forgiven, config_version
ALTER TABLE loan_repayments
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS outstanding_balance_after DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS interest_forgiven DECIMAL(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS config_version INTEGER;

-- Back-fill recorded_at from created_at where available, otherwise use payment_date
UPDATE loan_repayments
SET recorded_at = COALESCE(created_at, payment_date::timestamp)
WHERE recorded_at IS NULL;

-- Make recorded_at NOT NULL after back-fill
ALTER TABLE loan_repayments ALTER COLUMN recorded_at SET NOT NULL;
ALTER TABLE loan_repayments ALTER COLUMN recorded_at SET DEFAULT NOW();

-- Back-fill outstanding_balance_after from legacy column
UPDATE loan_repayments
SET outstanding_balance_after = outstanding_balance_after_amount
WHERE outstanding_balance_after IS NULL AND outstanding_balance_after_amount IS NOT NULL;

-- Default interest_forgiven to 0 for existing records
UPDATE loan_repayments SET interest_forgiven = 0 WHERE interest_forgiven IS NULL;
ALTER TABLE loan_repayments ALTER COLUMN interest_forgiven SET NOT NULL;
ALTER TABLE loan_repayments ALTER COLUMN interest_forgiven SET DEFAULT 0;

-- 2. loans: add disbursed_by
ALTER TABLE loans ADD COLUMN IF NOT EXISTS disbursed_by VARCHAR(255);

-- 3. loan_penalties: add outstanding_at_assessment (base amount used for penalty calculation)
ALTER TABLE loan_penalties
    ADD COLUMN IF NOT EXISTS outstanding_at_assessment_amount DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS outstanding_at_assessment_currency VARCHAR(3) DEFAULT 'ETB';

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_loan_repayments_recorded_at ON loan_repayments(recorded_at);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan_date ON loan_repayments(loan_id, payment_date);
