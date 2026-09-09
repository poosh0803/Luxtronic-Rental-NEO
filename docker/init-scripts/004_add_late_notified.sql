-- Migration for databases already initialized before late_notified_at existed.
-- (docker/init-scripts only runs automatically on a fresh empty volume, so
-- this needs to be applied by hand against any already-running database -
-- local Docker or the live server.)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS late_notified_at TIMESTAMPTZ;
