-- irlpass v2: trips (the calendar) + unlocks (the paywall) + founding free slots
-- Run once in the Supabase SQL editor. Idempotent (safe to re-run).

-- ── trips: the dates someone will be in a city. this is the inventory ───────
create table if not exists trips (
  id          bigint generated always as identity primary key,
  member_no   text not null,
  city        text not null,
  starts      date not null,
  ends        date not null,
  flexible    boolean not null default false,  -- "i'm flexible" — dates are a guess
  note        text,                            -- what they're up for, free text
  created_at  timestamptz not null default now()
);
create index if not exists trips_city_dates_idx on trips (city, starts, ends);
create index if not exists trips_member_idx on trips (member_no);

-- ── unlocks: one purchased window. covers every trip that overlaps it ──────
create table if not exists unlocks (
  id             bigint generated always as identity primary key,
  member_no      text not null,
  city           text not null,
  starts         date not null,
  ends           date not null,
  source         text not null default 'stripe', -- 'stripe' | 'founding' | 'comp'
  stripe_session text,
  created_at     timestamptz not null default now()
);
create index if not exists unlocks_member_idx on unlocks (member_no);

-- ── founding slots: the first N members to post dates message for free ─────
alter table members add column if not exists founding_free boolean not null default false;
alter table members add column if not exists founding_no integer;         -- 1..N, order they claimed a slot
create unique index if not exists members_founding_no_idx on members (founding_no) where founding_no is not null;

-- remembers which city-opening email a member already got, so it only sends once
alter table members add column if not exists city_opened text;
