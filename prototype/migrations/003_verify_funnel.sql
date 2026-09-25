-- Josh's #10: measure the drop-off on instagram verification.
-- "reached bio verification" is stamped when the code is first shown;
-- ig_verified_at already records completion, so the two give us the funnel.
alter table members add column if not exists verify_seen_at timestamptz;

-- Josh's "start logging city requests": every "is this in ___" that comes
-- through his DMs is roadmap data, and right now it evaporates.
create table if not exists city_requests (
  id bigserial primary key,
  city text not null,
  member_no text,
  source text default 'app',
  created_at timestamptz not null default now()
);
create index if not exists city_requests_city_idx on city_requests (city);
