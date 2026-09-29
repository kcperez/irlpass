-- small editable settings (josh's welcome dm text lives here)
create table if not exists app_settings (key text primary key, value text, updated_at timestamptz not null default now());
alter table app_settings enable row level security;
