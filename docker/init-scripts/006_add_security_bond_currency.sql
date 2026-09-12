-- Migration for databases already initialized before security_bond_currency
-- existed. (docker/init-scripts only runs automatically on a fresh empty
-- volume, so this needs to be applied by hand against any already-running
-- database - local Docker or the live server.)
--
-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so the CHECK constraint
-- (kept in sync with 001_schema.sql for fresh installs) is added guarded by
-- a catalog lookup instead - safe to run this file more than once.
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS security_bond_currency VARCHAR(10) NOT NULL DEFAULT 'AUD';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rentals_security_bond_currency_check'
  ) THEN
    ALTER TABLE rentals ADD CONSTRAINT rentals_security_bond_currency_check CHECK (security_bond_currency IN ('AUD', 'RMB'));
  END IF;
END $$;
