-- give to get: post dates in a city and you see faces there; anyone can hide theirs
alter table members add column if not exists hide_photo boolean not null default false;
