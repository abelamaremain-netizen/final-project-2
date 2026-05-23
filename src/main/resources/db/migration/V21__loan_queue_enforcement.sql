-- V21: Loan Queue Enforcement
-- Adds FIFO queue enforcement columns to loan_applications and loans tables.
-- No new tables are created — all skip request data lives on loan_applications.

-- ── loan_applications: skip (direct manager skip) ────────────────────────────
ALTER TABLE loan_applications
    ADD COLUMN IF NOT EXISTS is_skipped    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS skip_reason   TEXT,
    ADD COLUMN IF NOT EXISTS skipped_by    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS skipped_at    TIMESTAMP;

-- ── loan_applications: skip request (loan officer → manager workflow) ─────────
ALTER TABLE loan_applications
    ADD COLUMN IF NOT EXISTS skip_request_reason            TEXT,
    ADD COLUMN IF NOT EXISTS skip_requested_by              VARCHAR(255),
    ADD COLUMN IF NOT EXISTS skip_requested_at              TIMESTAMP,
    ADD COLUMN IF NOT EXISTS skip_request_status            VARCHAR(30),
    ADD COLUMN IF NOT EXISTS skip_request_review_note       TEXT,
    ADD COLUMN IF NOT EXISTS skip_request_rejection_reason  TEXT,
    ADD COLUMN IF NOT EXISTS skip_request_reviewed_by       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS skip_request_reviewed_at       TIMESTAMP,
    ADD COLUMN IF NOT EXISTS skip_request_previous_status   VARCHAR(30);

-- ── loan_applications: backfill queue_position for existing rows ──────────────
-- Assigns sequential positions based on submission_date order.
-- Rows that already have a queue_position are left unchanged.
UPDATE loan_applications
SET queue_position = sub.rn
FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY submission_date ASC NULLS LAST) AS rn
    FROM loan_applications
    WHERE queue_position IS NULL
) sub
WHERE loan_applications.id = sub.id;

-- ── loan_applications: enforce unique queue positions going forward ───────────
-- Only add the constraint if it doesn't already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_loan_applications_queue_position'
    ) THEN
        ALTER TABLE loan_applications
            ADD CONSTRAINT uq_loan_applications_queue_position UNIQUE (queue_position);
    END IF;
END $$;

-- ── loans: disbursement skip ──────────────────────────────────────────────────
ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS disbursement_skip_reason   TEXT,
    ADD COLUMN IF NOT EXISTS disbursement_skipped_by    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS disbursement_skipped_at    TIMESTAMP;
