-- The Learn path (GET /api/path). A lesson or practice session started from
-- a circle on the path remembers which one (skill:<id>, review:<domain>:<k>,
-- check:<domain> or end), so review and unit-check circles stay done.
-- Nullable and ignored by older Workers, so a rollback keeps working.
ALTER TABLE lessons ADD COLUMN node TEXT;
CREATE INDEX lessons_node ON lessons (learner_id, node) WHERE node IS NOT NULL;
