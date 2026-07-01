-- irlpass freemium + reputation + safety + DMs migration
-- Run once in the Supabase SQL editor. Idempotent (safe to re-run).

-- ── activities: city + audience ─────────────────────────────────────────────
alter table activities add column if not exists city text not null default 'medellin';
alter table activities add column if not exists audience text not null default 'open'; -- 'open' | 'women_nb'
create index if not exists activities_city_idx on activities (city);
-- backfill any pre-existing rows to medellin (the only seeded city today)
update activities set city = 'medellin' where city is null;

-- ── members: onboarding + reputation + safety ───────────────────────────────
alter table members add column if not exists gender text;                  -- 'woman' | 'man' | 'nonbinary'
alter table members add column if not exists birthday date;                -- 18+ enforced at signup
alter table members add column if not exists interests jsonb default '[]'::jsonb;
alter table members add column if not exists verified_selfie boolean not null default false;
alter table members add column if not exists rep_score numeric;            -- avg rating, null until first review
alter table members add column if not exists rep_count integer not null default 0;
alter table members add column if not exists allow_dm_from_men boolean not null default true;
alter table members add column if not exists show_ig_to_men boolean not null default true;

-- ── reviews: rate an activity (rolls up to the host) or an attendee ──────────
create table if not exists reviews (
  id           bigint generated always as identity primary key,
  activity_id  text not null,
  reviewer_no  text not null,
  target_no    text not null,                 -- whose reputation this affects
  target_type  text not null default 'host',  -- 'host' | 'attendee'
  rating       smallint not null check (rating between 1 and 5),
  note         text,
  created_at   timestamptz not null default now(),
  unique (activity_id, reviewer_no, target_no) -- one review per person per meetup
);
create index if not exists reviews_target_idx on reviews (target_no);

-- ── reports: private safety flags, never shown publicly ─────────────────────
create table if not exists reports (
  id           bigint generated always as identity primary key,
  reporter_no  text not null,
  target_type  text not null,                 -- 'user' | 'activity'
  target_id    text not null,                 -- member_no or activity id
  reason       text,
  created_at   timestamptz not null default now(),
  resolved     boolean not null default false
);
create index if not exists reports_open_idx on reports (resolved, created_at);

-- ── direct messages: free within a shared activity, paid to reach strangers ──
create table if not exists dm_threads (
  id          bigint generated always as identity primary key,
  a_no        text not null,                  -- always the lexicographically smaller member_no
  b_no        text not null,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  unique (a_no, b_no)
);
create table if not exists dm_messages (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references dm_threads(id) on delete cascade,
  from_no     text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists dm_messages_thread_idx on dm_messages (thread_id, id);
