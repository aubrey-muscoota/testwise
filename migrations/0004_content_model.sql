-- Multi-exam content model (v1): exams have sections, sections have domains.
-- Items gain stimuli: a passage (or two, for cross-text items) and a figure spec.
CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

ALTER TABLE domains ADD COLUMN section_id TEXT REFERENCES sections(id);
ALTER TABLE items ADD COLUMN passage TEXT;
ALTER TABLE items ADD COLUMN passage2 TEXT;
ALTER TABLE items ADD COLUMN figure_json TEXT;
ALTER TABLE lessons ADD COLUMN section_id TEXT;              -- placement quizzes: which section

-- The v0 exam "sat-math" becomes the Math section of the exam "sat".
INSERT INTO exams (id, name) VALUES ('sat', 'SAT') ON CONFLICT (id) DO NOTHING;
INSERT INTO sections (id, exam_id, name, position) VALUES ('sat-math', 'sat', 'Math', 0) ON CONFLICT (id) DO NOTHING;
UPDATE domains SET exam_id = 'sat', section_id = 'sat-math' WHERE exam_id = 'sat-math';
UPDATE skills SET exam_id = 'sat' WHERE exam_id = 'sat-math';
DELETE FROM exams WHERE id = 'sat-math';
