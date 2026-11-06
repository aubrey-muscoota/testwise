-- Age gate and AI consent (v1). Both are timestamps; NULL means not yet given.
ALTER TABLE learners ADD COLUMN age_confirmed_at INTEGER;
ALTER TABLE learners ADD COLUMN ai_consent_at INTEGER;
