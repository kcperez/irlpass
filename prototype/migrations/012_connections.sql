-- airbnb-style social layer + josh's 10/1 notes:
-- replies/reactions/edits in dms, any venue on the mood board, hide a trip,
-- and opting out of showing up in other people's connections.
alter table dm_messages add column if not exists reply_to bigint;
alter table dm_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table dm_messages add column if not exists edited boolean not null default false;
alter table dm_messages add column if not exists deleted boolean not null default false;

-- spots a member added by searching (openstreetmap), shown while someone's going
alter table spots add column if not exists added_by text;
alter table spots add column if not exists osm_id text;
create unique index if not exists spots_osm_idx on spots (osm_id) where osm_id is not null;

alter table trips add column if not exists hidden boolean not null default false;
alter table members add column if not exists hide_connections boolean not null default false;
