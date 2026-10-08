-- Migration for databases already initialized before the on-the-due-date
-- reminder existed. (docker/init-scripts only runs automatically on a fresh
-- empty volume, so apply this by hand against any already-running database -
-- local Docker or the live server.)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS due_notified_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS due_portal_notification_id VARCHAR(100);
