-- v4: venues pay, members are free. a partner venue gets irlpass nights + member
-- stories; the door qr logs each visit and unlocks the member's perk.
create table if not exists venues (
  slug text primary key,
  name text not null,
  city text not null default 'medellin',
  perk text not null default 'a free drink',
  story_perk text,
  plan text not null default 'listing', -- listing | founding | partner
  status text not null default 'lead',  -- lead | active | paused
  contact_name text,
  contact_email text,
  contact_phone text,
  instagram text,
  stripe_customer text,
  stripe_sub text,
  created_at timestamptz not null default now()
);

create table if not exists venue_checkins (
  id bigint generated always as identity primary key,
  venue_slug text not null references venues(slug) on delete cascade,
  member_no text not null,
  group_size int not null default 1,
  day date not null default current_date,
  spend_usd int,
  created_at timestamptz not null default now(),
  unique (venue_slug, member_no, day)
);

create table if not exists venue_stories (
  id bigint generated always as identity primary key,
  venue_slug text not null references venues(slug) on delete cascade,
  member_no text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists venue_checkins_venue_day on venue_checkins (venue_slug, day);
create index if not exists venue_stories_venue on venue_stories (venue_slug, created_at);

alter table venues enable row level security;
alter table venue_checkins enable row level security;
alter table venue_stories enable row level security;

-- the consumer paywall is off; ops can set this back to 'on'
insert into app_settings (key, value) values ('paywall', 'off') on conflict (key) do nothing;
