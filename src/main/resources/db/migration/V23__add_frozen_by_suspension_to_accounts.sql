-- V23: Track whether an account was frozen due to member suspension,
--       and store freeze/unfreeze reasons for audit trail.
--
-- frozen_by_suspension: distinguishes suspension-driven freezes from manual ones
--                       so only suspension-driven freezes are lifted on reactivation.
-- freeze_reason:        required reason recorded when an account is frozen.
-- unfreeze_reason:      required reason recorded when an account is unfrozen.

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS frozen_by_suspension BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS freeze_reason VARCHAR(500);

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS unfreeze_reason VARCHAR(500);
