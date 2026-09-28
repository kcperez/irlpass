-- the EDC weekend email goes out once per person
alter table members add column if not exists edc_emailed_at timestamptz;
