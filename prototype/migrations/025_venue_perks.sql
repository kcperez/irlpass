-- irlpass for venues: a venue signs up on its own (no member account), gets an
-- always-on story perk with a counter qr, and a guestlist of every handle that
-- posted. venues buy their own story slots. regulars can claim once a day.
alter table venues add column if not exists perk_credits integer not null default 0;
alter table venues add column if not exists perk_event_id bigint;
alter table venues add column if not exists out_noticed_at timestamptz;
alter table perk_claims add column if not exists claim_day date not null default current_date;
alter table perk_claims drop constraint if exists perk_claims_event_id_handle_key;
create unique index if not exists perk_claims_event_handle_day on perk_claims (event_id, handle, claim_day);
