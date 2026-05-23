-- Create sequences for short code generation
CREATE SEQUENCE IF NOT EXISTS mem_code_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS acc_code_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS loa_code_seq START 1 INCREMENT 1;

-- Add code columns to core business entities
ALTER TABLE members ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE;

-- Generate codes for existing records
UPDATE members SET code = 'MEM-' || LPAD(CAST(NEXTVAL('mem_code_seq') AS TEXT), 5, '0') WHERE code IS NULL;
UPDATE accounts SET code = 'ACC-' || LPAD(CAST(NEXTVAL('acc_code_seq') AS TEXT), 5, '0') WHERE code IS NULL;
UPDATE loans SET code = 'LOA-' || LPAD(CAST(NEXTVAL('loa_code_seq') AS TEXT), 5, '0') WHERE code IS NULL;

-- Make code columns NOT NULL after backfilling
ALTER TABLE members ALTER COLUMN code SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN code SET NOT NULL;
ALTER TABLE loans ALTER COLUMN code SET NOT NULL;

-- Create indexes for fast code-based lookups
CREATE INDEX IF NOT EXISTS idx_members_code ON members(code);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_loans_code ON loans(code);