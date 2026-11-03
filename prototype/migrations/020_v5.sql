-- v5 (josh, nov 2): every city the same, daily engagement, simpler app, run club.
-- safe to run twice.

-- spots: member-added spots wait for approval, real prices, google place ids
alter table spots add column if not exists pending boolean not null default false;
alter table spots add column if not exists approved boolean not null default false;
alter table spots add column if not exists approved_at timestamptz;
alter table spots add column if not exists place_id text;
alter table spots add column if not exists price_level smallint;      -- 1-4 ($-$$$$)
alter table spots add column if not exists price_range text;          -- "$20–30" per person, google's
alter table spots add column if not exists group_spend_pp numeric;    -- our own: door-qr spend / group size
alter table spots add column if not exists note text;                 -- the adder's one line
alter table spots add column if not exists pro_lead boolean not null default false;
create unique index if not exists spots_place_id on spots (place_id) where place_id is not null;

-- members: budget (never shown on profiles), home screen + push state, "down to hang"
alter table members add column if not exists budget text;             -- $ | $$ | $$$ | $$$$
alter table members add column if not exists installed_at timestamptz;
alter table members add column if not exists down_until timestamptz;
alter table members add column if not exists down_mood text;
alter table members add column if not exists down_city text;
alter table members add column if not exists notify_prefs jsonb not null default '{}'::jsonb;  -- { down:false, nudge:false, plans:false, groups:false, digest:false, runs:false }
alter table members add column if not exists founding_badge boolean not null default false;
alter table members add column if not exists last_digest_at timestamptz;

-- every push we send, so nobody gets more than 2 a day
create table if not exists push_log (
  id bigint generated always as identity primary key,
  member_no text not null,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index if not exists push_log_member_day on push_log (member_no, sent_at);
-- what waited (over the cap or in quiet hours): goes in the email digest
create table if not exists push_held (
  id bigint generated always as identity primary key,
  member_no text not null,
  kind text not null,
  title text not null,
  body text,
  go text,
  created_at timestamptz not null default now()
);
create index if not exists push_held_member on push_held (member_no, created_at);

-- custom group chats (like a whatsapp group, but they fade)
create table if not exists group_chats (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  created_by text not null,
  member_nos text[] not null default '{}',
  expires_at timestamptz,          -- null = keep
  ends_with text,                  -- 24h | dates | keep
  warned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists group_chats_members on group_chats using gin (member_nos);

-- reported messages survive the chat disappearing
create table if not exists message_reports (
  id bigint generated always as identity primary key,
  message_id bigint,
  channel text,
  body text,
  from_member_no text,
  reported_by text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- recurring weekly plans (saturday run club, thursday irlpass night)
alter table activities add column if not exists repeat_weekly boolean not null default false;
alter table activities add column if not exists series_id text;

-- run club
create table if not exists runs (
  id bigint generated always as identity primary key,
  slug text not null unique,
  host_no text not null,
  city text not null,
  name text not null,
  starts_at timestamptz not null,
  start_name text,
  start_lat double precision,
  start_lng double precision,
  route jsonb not null default '[]'::jsonb,        -- [[lng,lat],...]
  distance_km numeric,
  paces jsonb not null default '[]'::jsonb,        -- [{ key, label, minPerKm }]
  join_points jsonb not null default '[]'::jsonb,  -- [{ id, name, km }]
  cafe_name text,
  cafe_spot_id bigint,
  cafe_lat double precision,
  cafe_lng double precision,
  details text,                                    -- private: only people who rsvp'd
  public_route boolean not null default false,     -- routes are private by default
  status text not null default 'scheduled',        -- scheduled | gathering | running | at_cafe | done | cancelled
  repeat_weekly boolean not null default false,
  reminded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists runs_city_time on runs (city, starts_at);

create table if not exists run_rsvps (
  run_id bigint not null references runs(id) on delete cascade,
  member_no text not null,
  kind text not null default 'run',               -- run | hangout
  pace text,
  join_point text,
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (run_id, member_no)
);

-- ticketed parties on a run (peak and pace model): runs free, parties paid
create table if not exists run_parties (
  id bigint generated always as identity primary key,
  run_id bigint references runs(id) on delete set null,
  host_no text not null,
  city text not null,
  title text not null,
  kind text,                                       -- after-run | monthly | day-rave
  starts_at timestamptz not null,
  venue_slug text,
  venue_name text,
  price_cents integer not null,
  early_price_cents integer,
  early_until timestamptz,
  capacity integer not null default 100,
  opens_at timestamptz,                            -- runners who rsvp'd get 24h before this
  created_at timestamptz not null default now()
);
create table if not exists party_tickets (
  id bigint generated always as identity primary key,
  party_id bigint not null references run_parties(id) on delete cascade,
  member_no text not null,
  status text not null default 'pending',          -- pending | paid | waitlist | refunded
  price_cents integer,
  code text unique,
  stripe_session text,
  checked_in_at timestamptz,
  paid_out boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists party_tickets_party on party_tickets (party_id, status);

-- venues: owners sign in with their irlpass login; owners edit hours + photos
alter table venues add column if not exists owner_member_no text;
alter table venues add column if not exists hours jsonb;
alter table venues add column if not exists photos jsonb;

alter table push_log enable row level security;
alter table push_held enable row level security;
alter table group_chats enable row level security;
alter table message_reports enable row level security;
alter table runs enable row level security;
alter table run_rsvps enable row level security;
alter table run_parties enable row level security;
alter table party_tickets enable row level security;
