-- the "right now" check-in (how are you feeling -> three picks) and web push
create table if not exists now_checks (
  id bigint generated always as identity primary key,
  member_no text not null,
  feeling text not null,
  city text,
  area text,
  picks jsonb,
  created_at timestamptz not null default now()
);
create index if not exists now_checks_member_idx on now_checks (member_no, created_at);

create table if not exists push_subs (
  endpoint text primary key,
  member_no text not null,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_member_idx on push_subs (member_no);

-- so "near you" can measure distance
alter table spots add column if not exists lat double precision;
alter table spots add column if not exists lng double precision;

alter table now_checks enable row level security;
alter table push_subs enable row level security;
