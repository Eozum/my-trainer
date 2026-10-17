create table if not exists public.strava_connections (
 user_id uuid primary key references auth.users on delete cascade,
 encrypted_tokens text not null,
 updated_at timestamptz not null default now()
);
alter table public.strava_connections enable row level security;
revoke all on public.strava_connections from anon, authenticated;
-- Legacy Garmin connections are deliberately retained; remove after migration if desired.
