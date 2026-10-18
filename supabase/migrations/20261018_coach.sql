-- Standalone migration: no auth.users or legacy tables required.
create table if not exists public.coach_notebooks (
 id text primary key check (id = 'personal'),
 revision integer not null check (revision > 0),
 data jsonb not null,
 generation_day date,
 generation_count integer not null default 0,
 last_generation_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.coach_activities (
 notebook_id text not null references public.coach_notebooks(id) on delete cascade,
 id text not null, date date not null, name text,
 distance numeric not null check (distance > 0),
 minutes numeric not null check (minutes > 0),
 elevation numeric not null check (elevation >= 0),
 primary key (notebook_id, id)
);
create table if not exists public.training_sessions (
 notebook_id text not null references public.coach_notebooks(id) on delete cascade,
 id text not null, date date not null, kind text not null,
 km numeric not null check (km >= 0), minutes numeric not null check (minutes >= 0),
 elevation numeric not null check (elevation >= 0), note text not null,
 status text not null check (status in ('planned','done','missed')),
 primary key (notebook_id, id)
);
create table if not exists public.coach_plan_versions (
 id uuid primary key,
 notebook_id text not null references public.coach_notebooks(id) on delete cascade,
 source_revision integer not null,
 source_hash text not null,
 explanation text not null,
 proposed_state jsonb not null,
 previous_state jsonb,
 status text not null default 'pending' check (status in ('pending','applied')),
 created_at timestamptz not null default now(),
 applied_at timestamptz
);
create index if not exists coach_versions_notebook on public.coach_plan_versions(notebook_id, created_at desc);
alter table public.coach_notebooks enable row level security;
alter table public.coach_activities enable row level security;
alter table public.training_sessions enable row level security;
alter table public.coach_plan_versions enable row level security;
revoke all on public.coach_notebooks, public.coach_activities, public.training_sessions, public.coach_plan_versions from anon, authenticated;
grant all on public.coach_notebooks, public.coach_activities, public.training_sessions, public.coach_plan_versions to service_role;

-- Keep the state snapshot and queryable activity/session rows in one transaction.
create or replace function public.sync_coach_rows() returns trigger
language plpgsql set search_path = public as $$
begin
 delete from public.coach_activities where notebook_id = new.id;
 insert into public.coach_activities (notebook_id,id,date,name,distance,minutes,elevation)
 select new.id,a.id,a.date,a.name,a.distance,a.minutes,a.elevation
 from jsonb_to_recordset(new.data->'activities') as a(id text,date date,name text,distance numeric,minutes numeric,elevation numeric);
 delete from public.training_sessions where notebook_id = new.id;
 insert into public.training_sessions (notebook_id,id,date,kind,km,minutes,elevation,note,status)
 select new.id,s.id,s.date,s.kind,s.km,s.minutes,s.elevation,s.note,s.status
 from jsonb_to_recordset(new.data->'sessions') as s(id text,date date,kind text,km numeric,minutes numeric,elevation numeric,note text,status text);
 return new;
end $$;
drop trigger if exists coach_rows_sync on public.coach_notebooks;
create trigger coach_rows_sync after insert or update of data on public.coach_notebooks for each row execute function public.sync_coach_rows();

create or replace function public.save_coach_notebook(p_data jsonb, p_revision integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_revision integer;
begin
 if p_revision = 0 then
  insert into public.coach_notebooks(id,revision,data) values ('personal',1,p_data) on conflict do nothing returning revision into v_revision;
 else
  update public.coach_notebooks set data=p_data, revision=revision+1, updated_at=now()
  where id='personal' and revision=p_revision returning revision into v_revision;
 end if;
 if v_revision is null then raise exception 'COACH_CONFLICT'; end if;
 return v_revision;
end $$;

create or replace function public.reserve_coach_generation(p_revision integer) returns void
language plpgsql security definer set search_path = public as $$
declare n public.coach_notebooks%rowtype;
 today date := (now() at time zone 'UTC')::date;
begin
 select * into n from public.coach_notebooks where id='personal' for update;
 if not found or n.revision <> p_revision then raise exception 'COACH_CONFLICT'; end if;
 if n.last_generation_at > now()-interval '1 minute' or (n.generation_day=today and n.generation_count >= 10) then raise exception 'COACH_RATE_LIMIT'; end if;
 update public.coach_notebooks set generation_day=today,
 generation_count=case when generation_day=today then generation_count+1 else 1 end,
 last_generation_at=now() where id='personal';
end $$;

create or replace function public.apply_coach_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.coach_notebooks%rowtype;
 v public.coach_plan_versions%rowtype;
begin
 -- Always lock notebook first, including concurrent approvals of different versions.
 select * into n from public.coach_notebooks where id='personal' for update;
 if not found then raise exception 'COACH_CONFLICT'; end if;
 select * into v from public.coach_plan_versions where id=p_id and notebook_id='personal' for update;
 if not found then raise exception 'COACH_CONFLICT'; end if;
 -- Replays cannot overwrite changes made since the first application.
 if v.status <> 'pending' or v.source_revision <> n.revision then raise exception 'COACH_CONFLICT'; end if;
 if (v.created_at at time zone 'UTC')::date <> (now() at time zone 'UTC')::date then raise exception 'COACH_EXPIRED'; end if;
 update public.coach_plan_versions set status='applied', previous_state=n.data, applied_at=now() where id=p_id;
 update public.coach_notebooks set data=v.proposed_state, revision=revision+1, updated_at=now() where id='personal' returning * into n;
 return jsonb_build_object('revision',n.revision,'data',n.data);
end $$;
revoke all on function public.sync_coach_rows() from public, anon, authenticated;
revoke all on function public.save_coach_notebook(jsonb,integer) from public, anon, authenticated;
revoke all on function public.reserve_coach_generation(integer) from public, anon, authenticated;
revoke all on function public.apply_coach_proposal(uuid) from public, anon, authenticated;
grant execute on function public.save_coach_notebook(jsonb,integer) to service_role;
grant execute on function public.reserve_coach_generation(integer) to service_role;
grant execute on function public.apply_coach_proposal(uuid) to service_role;
