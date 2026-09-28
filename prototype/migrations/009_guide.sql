-- the recs guide: real info + photos for each spot (google maps, via apify),
-- plus the EDC email stamp from 008.
alter table spots add column if not exists photos jsonb;        -- our stored copies, first is the cover
alter table spots add column if not exists rating numeric;
alter table spots add column if not exists reviews integer;
alter table spots add column if not exists address text;
alter table spots add column if not exists category text;
alter table spots add column if not exists price text;
alter table spots add column if not exists website text;
alter table spots add column if not exists maps_url text;
alter table spots add column if not exists hours jsonb;
alter table spots add column if not exists blurb text;          -- the guide's line on why you go
alter table spots add column if not exists quote text;          -- a real review, short
alter table spots add column if not exists enriched_at timestamptz;
alter table members add column if not exists edc_emailed_at timestamptz;
