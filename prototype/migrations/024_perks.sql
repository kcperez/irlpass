-- self-serve perks: a host puts "50 free smoothies, 1 story = 1 smoothie" on
-- their event; guests submit a screenshot, claude or the host approves it, and
-- the guest shows a live pass at the counter
alter table events add column if not exists perk jsonb; -- { item, qty, ask: story|post|reel, tags: [] }
create table if not exists perk_claims (
  id bigint generated always as identity primary key,
  event_id bigint not null references events (id) on delete cascade,
  member_no text not null,
  image_url text,
  status text not null default 'pending', -- pending | approved | rejected | given
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  given_at timestamptz,
  unique (event_id, member_no)
);
alter table perk_claims enable row level security;
