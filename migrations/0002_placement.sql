-- Placement quiz lessons are marked so finishing one can test out skills.
ALTER TABLE lessons ADD COLUMN kind TEXT NOT NULL DEFAULT 'skill';
-- Skills a learner skipped via the placement quiz (still open to practice).
ALTER TABLE skill_mastery ADD COLUMN tested_out INTEGER NOT NULL DEFAULT 0;
