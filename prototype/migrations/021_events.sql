-- events first (nov 12): every week we list what's on in each city (luma +
-- eventbrite), members tap "going", and each event gets its own group chat
-- (channel ev-<id>). organizers can claim their listing later.
-- safe to run twice.

create table if not exists events (
  id bigint generated always as identity primary key,
  source text not null,                 -- luma | eventbrite | irlpass
  source_id text not null,
  city text not null,                   -- our city slug
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text,
  address text,
  lat double precision,
  lng double precision,
  cover text,
  url text,                             -- where tickets / rsvp live (theirs)
  price_cents integer,
  currency text,
  is_free boolean,
  category text not null default 'social', -- run | wellness | party | music | food | art | social | tech
  guests integer,
  host text,
  claimed_by text,                      -- organizer contact once they claim it
  hidden boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists events_city_starts on events (city, starts_at) where not hidden;

create table if not exists event_going (
  event_id bigint not null references events (id) on delete cascade,
  member_no text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, member_no)
);
create index if not exists event_going_member on event_going (member_no);

alter table events enable row level security;
alter table event_going enable row level security;
