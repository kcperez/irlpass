-- a short "what is this" for every event, in our voice, written the first time
-- someone opens it (from the event's own page) and kept for everyone after.
alter table events add column if not exists about jsonb; -- { en, es }
