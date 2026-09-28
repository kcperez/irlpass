-- josh's EDC sprint: mood tab, hand-picked spots, "i'm going tonight",
-- live "i'm out" presence, home city at signup, and a flag on guessed dates.

-- the spots on each mood board. josh curates these from ops.
create table if not exists spots (
  id bigint generated always as identity primary key,
  city text not null default 'medellin',
  mood text not null,               -- pregame | afters | chill
  name text not null,
  area text,                        -- neighborhood, e.g. el poblado
  kind text,                        -- rooftop, bar, club, coffee, gym…
  tag text,                         -- 'recovery' for the daytime wellness list
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists spots_city_mood_idx on spots (city, mood);

-- one row per member per spot per night: "i'm going tonight"
create table if not exists spot_going (
  spot_id bigint not null,
  member_no text not null,
  night date not null,
  created_at timestamptz not null default now(),
  primary key (spot_id, member_no, night)
);

-- tonight's mood, one per member per night; history is the stickiness metric
create table if not exists moods (
  member_no text not null,
  night date not null,
  mood text not null,
  city text not null default 'medellin',
  updated_at timestamptz not null default now(),
  primary key (member_no, night)
);

-- "i'm out in laureles, come find me": neighborhood only, expires
create table if not exists presence (
  member_no text primary key,
  city text not null,
  area text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- where you live, asked at signup: locals are what fill an empty calendar
alter table members add column if not exists home_city text;

-- trips that came from the old preset buttons, until their owner confirms them
alter table trips add column if not exists guess boolean not null default false;

alter table spots enable row level security;
alter table spot_going enable row level security;
alter table moods enable row level security;
alter table presence enable row level security;
