create table public.runner_state (
 user_id uuid primary key references auth.users on delete cascade,
 data jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.runner_state enable row level security;
create policy "own state" on public.runner_state for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create table public.garmin_connections (
 user_id uuid primary key references auth.users on delete cascade,
 encrypted_tokens text not null,
 updated_at timestamptz not null default now()
);
alter table public.garmin_connections enable row level security;
-- No user policy: OAuth tokens accessible only to server service role.
revoke all on public.garmin_connections from anon, authenticated;

create table if not exists public.strava_connections (
 user_id uuid primary key references auth.users on delete cascade,
 encrypted_tokens text not null,
 updated_at timestamptz not null default now()
);
alter table public.strava_connections enable row level security;
revoke all on public.strava_connections from anon, authenticated;
-- Legacy Garmin connections are deliberately retained; remove after migration if desired.
