-- real cities only: every city someone picks is checked against openstreetmap
-- and remembered here with its flag, so every room and chip has an identity.
create table if not exists cities (
  slug text primary key,
  name text not null,
  country text,
  emoji text,
  created_at timestamptz not null default now()
);

-- mods (kevin, josh) can flip to "member view" to test exactly what a regular
-- free member sees: no mod powers, no pass, no founding slot.
alter table members add column if not exists test_as_member boolean not null default false;
