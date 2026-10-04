-- josh's 10/2-10/3 conversion pass: paywall at send, free first month,
-- one-time comp codes, referrals, the in-app ride, "out tonight?", hosts.

-- comps: a free month from a code (ride buyers, hosts, promos, referrals)
alter table members add column if not exists comp_until date;
alter table members add column if not exists referred_by text;
alter table members add column if not exists stripe_sub text;

create table if not exists codes (
  code text primary key,
  kind text not null default 'promo',        -- ride | host | promo | referral
  months integer not null default 1,
  max_uses integer not null default 1,
  uses integer not null default 0,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists code_redemptions (
  code text not null,
  member_no text not null,
  created_at timestamptz not null default now(),
  primary key (code, member_no)
);

-- classpass-style: both on the monthly plan -> both get a free month, once
create table if not exists referrals (
  referee text primary key,
  referrer text not null,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- the guaranteed ride (members only), bought in the app
create table if not exists rides (
  id bigint generated always as identity primary key,
  city text not null default 'medellin',
  title text not null,
  night date not null,
  depart text,                 -- "3am from the stadium"
  price_cents integer not null default 5000,
  seats integer not null default 8,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists ride_orders (
  id bigint generated always as identity primary key,
  ride_id bigint not null,
  member_no text not null,
  stripe_session text unique,
  status text not null default 'pending',   -- pending | paid
  created_at timestamptz not null default now()
);

-- "out tonight?" and "which nights are you down this week?"
create table if not exists night_plans (
  member_no text not null,
  night date not null,
  city text not null default 'medellin',
  answer text not null,        -- out | skip
  created_at timestamptz not null default now(),
  primary key (member_no, night)
);

-- "yes, i want to host" + what they'd want to earn
create table if not exists host_interest (
  member_no text primary key,
  earn_range text,
  note text,
  created_at timestamptz not null default now()
);

alter table codes enable row level security;
alter table code_redemptions enable row level security;
alter table referrals enable row level security;
alter table rides enable row level security;
alter table ride_orders enable row level security;
alter table night_plans enable row level security;
alter table host_interest enable row level security;

insert into app_settings (key, value) values
  ('founding_free_dms', 'off'),
  ('referral_reward_cents', '2900'),
  ('trial_days', '30')
on conflict (key) do nothing;
