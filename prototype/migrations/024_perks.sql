-- self-serve story perks: a host puts "50 free smoothies, 1 story = 1 smoothie"
-- on their event. anyone (no irlpass account) scans the qr, types their
-- instagram handle and gets a pass. at the counter they show the live story in
-- their own instagram app, staff double tap the pass and it's used.
-- hosts get 20 free verified stories a month, then prepaid slots.
alter table events add column if not exists perk jsonb; -- { item, qty, ask: story|post|reel, tags: [] }
create table if not exists perk_claims (
  id bigint generated always as identity primary key,
  event_id bigint not null references events (id) on delete cascade,
  host_no text,
  handle text not null,
  member_no text,
  code text not null unique,
  status text not null default 'claimed', -- claimed | given
  created_at timestamptz not null default now(),
  given_at timestamptz,
  unique (event_id, handle)
);
create index if not exists perk_claims_host_given on perk_claims (host_no, given_at);
alter table perk_claims enable row level security;
alter table members add column if not exists perk_credits integer not null default 0;
create table if not exists perk_purchases (
  session_id text primary key,
  host_no text not null,
  slots integer not null,
  cents integer not null,
  created_at timestamptz not null default now()
);
alter table perk_purchases enable row level security;
-- members add events they spot (instagram flyers, links): who added it
alter table events add column if not exists submitted_by text;
