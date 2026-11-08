-- v1.5: test-date profile, practice mode and fresh questions written by Claude.

-- Profile. exam_date is YYYY-MM-DD; NULL with plan_started_at set means
-- "not booked yet" (the plan assumes a test 8 weeks after plan_started_at).
-- plan_started_at is the learner's local day the current plan began; it
-- resets whenever the exam date changes. NULL means no profile yet.
ALTER TABLE learners ADD COLUMN exam_date TEXT;
ALTER TABLE learners ADD COLUMN target_score INTEGER;
ALTER TABLE learners ADD COLUMN daily_minutes INTEGER;
ALTER TABLE learners ADD COLUMN plan_started_at TEXT;

-- Practice sessions are lessons with kind = 'practice' and one of the modes
-- weak | mixed | skill | timed | mistakes | fresh.
ALTER TABLE lessons ADD COLUMN mode TEXT;
CREATE INDEX lessons_learner_day ON lessons(learner_id, local_day);
CREATE INDEX attempts_learner_day ON attempts(learner_id, local_day);

-- Generated questions live in `items` (so answers, reports, Socrates and the
-- attempts/item_checks foreign keys work unchanged) with source = 'generated'
-- and status = 'generated' (served by practice only; lessons and the tree
-- count only status = 'live'). A pulled one gets status = 'pulled'.
ALTER TABLE items ADD COLUMN source TEXT NOT NULL DEFAULT 'bank';

-- The seed retires every item that isn't in the content files. Generated
-- items never are, so keep the seed from touching them.
CREATE TRIGGER items_keep_generated BEFORE UPDATE OF status ON items
FOR EACH ROW WHEN OLD.source = 'generated' AND NEW.status = 'retired'
BEGIN
  SELECT RAISE(IGNORE);
END;

-- Bookkeeping for generated items: who triggered them (NULLed when that
-- learner deletes their data), when, how often served, which model wrote them.
CREATE TABLE generated_items (
  id TEXT PRIMARY KEY REFERENCES items(id),   -- gen-<skill>-<random>
  skill_id TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  learner_id TEXT,
  created_at INTEGER NOT NULL,
  created_day TEXT NOT NULL,                  -- UTC day, for the global daily cap
  learner_day TEXT NOT NULL,                  -- learner's local day, for the per-learner cap
  model TEXT,
  served_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX generated_items_learner ON generated_items(learner_id, learner_day);
CREATE INDEX generated_items_day ON generated_items(created_day);
CREATE INDEX generated_items_skill ON generated_items(skill_id);
