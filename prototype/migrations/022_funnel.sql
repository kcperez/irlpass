-- event titles in every app language, why someone's here, whether they'd post
-- for perks, and who brought a person to an event (their share link)
alter table events add column if not exists titles jsonb;
alter table members add column if not exists why_here text;
alter table members add column if not exists earn text;
alter table event_going add column if not exists via text;
