-- zach's ask (josh's 9/24 notes): a rough neighborhood for where you're staying,
-- airbnb-style. neighborhood only, never an address; exact location stays
-- something people share themselves in a dm.
alter table trips add column if not exists area text;
