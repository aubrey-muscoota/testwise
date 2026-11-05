-- Testwise v0 schema (Cloudflare D1 / SQLite).
-- Content tables are shared; progress tables are per learner.

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  domain_id TEXT NOT NULL REFERENCES domains(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  prereqs TEXT NOT NULL DEFAULT '[]'          -- JSON array of skill ids
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  difficulty INTEGER NOT NULL,                -- 1 easy, 2 medium, 3 hard
  type TEXT NOT NULL,                         -- 'mc' | 'spr'
  stem TEXT NOT NULL,
  table_json TEXT,                            -- optional {"headers":[],"rows":[[]]}
  choices TEXT,                               -- JSON array (mc only)
  answer TEXT NOT NULL,
  accept TEXT NOT NULL DEFAULT '[]',          -- other accepted forms (spr)
  explanation TEXT NOT NULL,                  -- JSON array of steps
  hints TEXT NOT NULL,                        -- JSON array of Socratic questions
  wrong_reasons TEXT NOT NULL DEFAULT '{}',   -- JSON {choice: misconception}
  rating REAL NOT NULL,                       -- adaptive difficulty, starts from `difficulty`
  status TEXT NOT NULL DEFAULT 'live',        -- 'live' | 'retired'
  reports INTEGER NOT NULL DEFAULT 0          -- "report this question" count
);
CREATE INDEX items_skill ON items(skill_id, status);

CREATE TABLE item_checks (
  id INTEGER PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL,                         -- 'code' | 'blind_solver' | 'human' | 'report'
  passed INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE learners (
  id TEXT PRIMARY KEY,                        -- random id kept on the device; no account
  created_at INTEGER NOT NULL
);

CREATE TABLE attempts (
  id INTEGER PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  skill_id TEXT NOT NULL,
  lesson_id TEXT,
  correct INTEGER NOT NULL,
  response TEXT,
  time_ms INTEGER,
  is_review INTEGER NOT NULL DEFAULT 0,
  answered_at INTEGER NOT NULL,
  local_day TEXT NOT NULL                     -- YYYY-MM-DD in the learner's time zone
);
CREATE INDEX attempts_learner ON attempts(learner_id, answered_at);
CREATE INDEX attempts_learner_item ON attempts(learner_id, item_id);

CREATE TABLE skill_mastery (
  learner_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (learner_id, skill_id)
);

CREATE TABLE reviews (
  learner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  interval_days REAL NOT NULL,
  PRIMARY KEY (learner_id, item_id)
);
CREATE INDEX reviews_due ON reviews(learner_id, due_at);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  skill_id TEXT,                              -- null for a mixed review lesson
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  correct INTEGER,
  total INTEGER,
  xp INTEGER,
  local_day TEXT
);
CREATE INDEX lessons_learner ON lessons(learner_id, completed_at);

CREATE TABLE tutor_turns (
  id INTEGER PRIMARY KEY,
  learner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  local_day TEXT NOT NULL,
  role TEXT NOT NULL,                         -- 'student' | 'socrates'
  content TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX tutor_turns_day ON tutor_turns(learner_id, local_day);
