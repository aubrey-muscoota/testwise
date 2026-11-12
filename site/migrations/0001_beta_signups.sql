-- Beta sign-ups from the website. Kept apart from the app's database, so
-- emails never sit next to practice data.
CREATE TABLE beta_signups (
  email TEXT PRIMARY KEY,
  test_month TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
