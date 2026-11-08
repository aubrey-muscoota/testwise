-- Exam packs (v1.5): each exam is a folder exams/<id>/ that the seed loads.
-- The exams row carries the pack's exam.json and voice.json, so the Worker
-- reads exam specifics (sections, timing, scoring, placement, plan defaults,
-- Socrates' lines) from the database instead of hard-coding them.
ALTER TABLE exams ADD COLUMN config TEXT;                  -- exam.json (JSON)
ALTER TABLE exams ADD COLUMN voice TEXT;                   -- voice.json (JSON)
ALTER TABLE exams ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
-- Share of the section's questions that come from this domain (skills.json "weight").
ALTER TABLE domains ADD COLUMN weight REAL;
-- Which exam a learner is preparing for. NULL means the default exam
-- (wrangler var DEFAULT_EXAM, else the first exam by position).
ALTER TABLE learners ADD COLUMN exam_id TEXT REFERENCES exams(id);
