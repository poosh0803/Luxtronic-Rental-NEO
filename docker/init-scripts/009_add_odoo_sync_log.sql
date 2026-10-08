-- Migration for databases already initialized before the Odoo sync log
-- existed. (docker/init-scripts only runs automatically on a fresh empty
-- volume, so apply this by hand against any already-running database -
-- local Docker or the live server.)
CREATE TABLE IF NOT EXISTS odoo_sync_log (
  id SERIAL PRIMARY KEY,
  -- Not a foreign key on purpose: the log must outlive a deleted rental.
  rental_id INTEGER,
  action VARCHAR(20) NOT NULL,
  ok BOOLEAN NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created ON odoo_sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_rental ON odoo_sync_log (rental_id);
