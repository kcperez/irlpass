-- Josh's vibes onboarding: members.interests already holds the picks (reused,
-- no new data model). this only adds the funnel stamp so ops can see
-- how many existing members were shown the vibes prompt vs how many finished.
alter table members add column if not exists vibes_seen_at timestamptz;
