-- hosts (can_host members like josh) create their own events: a spot limit,
-- details, and an optional ticket price paid through stripe
alter table events add column if not exists host_no text;
alter table events add column if not exists capacity integer;
alter table events add column if not exists details text;
alter table event_going add column if not exists paid_cents integer;
alter table event_going add column if not exists stripe_session text;
create unique index if not exists event_going_session on event_going (stripe_session) where stripe_session is not null;
