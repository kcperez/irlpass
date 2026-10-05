-- josh: how many hit the paywall vs pay. one row each time the paywall shows.
create table if not exists paywall_events (
  id bigint generated always as identity primary key,
  member_no text not null,
  reason text not null,          -- deliver | member | dm | city
  created_at timestamptz not null default now()
);
create index if not exists paywall_events_at_idx on paywall_events (created_at);
alter table paywall_events enable row level security;
