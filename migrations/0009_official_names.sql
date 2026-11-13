-- Skills and units carry two names: "name" is the learner's words ("Commas,
-- dashes and semicolons"), shown everywhere in the app; "official_name" is the
-- publisher's ("Boundaries"), as on score reports. The seed fills both from
-- skills.json. Older Workers ignore the column, so a rollback keeps working.
ALTER TABLE domains ADD COLUMN official_name TEXT;
ALTER TABLE skills ADD COLUMN official_name TEXT;
