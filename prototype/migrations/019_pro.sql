-- irlpass pro (josh, oct 30): one plan, $69/mo with 14 days free. venues own
-- their profile, post what's on into the mood feed, and see attribution.
alter table venues add column if not exists owner_token text unique;
alter table venues add column if not exists booking_url text;
alter table venues add column if not exists blurb text;
alter table venues add column if not exists founding boolean not null default false;

-- what's on: "sound bath tonight 8pm", "zero-proof menu all week"
create table if not exists venue_posts (
  id bigint generated always as identity primary key,
  venue_slug text not null references venues(slug) on delete cascade,
  title text not null,
  body text,
  day date,                       -- null = runs until ends_on
  ends_on date not null,
  created_at timestamptz not null default now()
);
create index if not exists venue_posts_live on venue_posts (venue_slug, ends_on);

-- attribution the venue can't get from raisin: profile views + booking taps
create table if not exists venue_events (
  id bigint generated always as identity primary key,
  venue_slug text not null references venues(slug) on delete cascade,
  kind text not null,             -- view | book
  member_no text,
  day date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists venue_events_venue_day on venue_events (venue_slug, day);

alter table venue_posts enable row level security;
alter table venue_events enable row level security;

update venues set plan = 'pro' where plan in ('founding', 'partner');
