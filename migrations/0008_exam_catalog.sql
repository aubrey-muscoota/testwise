-- The test picker (GET /api/exams) lists every exam pack. A pack that isn't
-- enabled is a listing only (config NULL, enabled 0) and shows as "not ready
-- yet". A ready pack that is later turned off keeps its config, so learners
-- already on it keep working; it just can't be picked.
-- Older Workers ignore both columns, so a rollback keeps working.
ALTER TABLE exams ADD COLUMN short_name TEXT;
ALTER TABLE exams ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
