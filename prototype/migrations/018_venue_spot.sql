-- a partner venue points at its spot on the guide, so members see the perk there
alter table venues add column if not exists spot_id bigint;
alter table venues add column if not exists area text;
