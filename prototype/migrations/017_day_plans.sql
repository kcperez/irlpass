-- "my day": a planned day (lagos-style timeline), shareable by link
create table if not exists day_plans (
  id text primary key,
  member_no text not null,
  city text,
  city_name text,
  date date,
  wish text,
  stops jsonb not null default '[]'::jsonb,
  picks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists day_plans_member_idx on day_plans (member_no, created_at);
alter table day_plans enable row level security;
