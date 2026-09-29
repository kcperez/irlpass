-- the "where irlpass is" map: every city needs a point
alter table cities add column if not exists lat double precision;
alter table cities add column if not exists lng double precision;
