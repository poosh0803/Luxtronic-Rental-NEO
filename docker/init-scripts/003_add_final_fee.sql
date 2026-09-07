-- Migration for databases already initialized before final_fee existed.
-- (docker/init-scripts only runs automatically on a fresh empty volume, so
-- this needs to be applied by hand against any already-running database -
-- local Docker or the live server.)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS final_fee NUMERIC(10, 2);
