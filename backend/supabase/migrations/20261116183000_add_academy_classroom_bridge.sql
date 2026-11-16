create table public.academy_live_sessions (
  academy_session_id text primary key,
  external_session_id text,
  teacher_external_id text not null,
  cohort_external_id text not null,
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  state text not null default 'scheduled'
    check (state in ('scheduled','starting','live','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academy_join_intents (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  academy_session_id text not null references public.academy_live_sessions(academy_session_id) on delete cascade,
  external_user_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  room_role public.room_role not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index academy_join_intents_expiry_idx on public.academy_join_intents(expires_at)
  where consumed_at is null;

create table public.academy_room_identities (
  room_user_id uuid primary key references auth.users(id) on delete cascade,
  academy_session_id text not null references public.academy_live_sessions(academy_session_id) on delete cascade,
  external_user_id text not null,
  room_role public.room_role not null,
  created_at timestamptz not null default now(),
  unique (academy_session_id, external_user_id, room_user_id)
);

create table public.academy_participation (
  academy_session_id text not null references public.academy_live_sessions(academy_session_id) on delete cascade,
  external_user_id text not null,
  room_role public.room_role not null,
  first_joined_at timestamptz not null,
  active_joined_at timestamptz,
  last_left_at timestamptz,
  duration_seconds bigint not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (academy_session_id, external_user_id)
);

alter table public.academy_live_sessions enable row level security;
alter table public.academy_join_intents enable row level security;
alter table public.academy_room_identities enable row level security;
alter table public.academy_participation enable row level security;
revoke all on public.academy_live_sessions, public.academy_join_intents,
  public.academy_room_identities, public.academy_participation from anon, authenticated;
grant all on public.academy_live_sessions, public.academy_join_intents,
  public.academy_room_identities, public.academy_participation to service_role;

create or replace function public.record_academy_participation(
  p_room_user_id uuid, p_event text, p_occurred_at timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
declare v_identity public.academy_room_identities%rowtype;
begin
  if p_event not in ('join','leave') then raise exception 'invalid_participation_event'; end if;
  select * into v_identity from public.academy_room_identities
    where room_user_id = p_room_user_id;
  if not found then return; end if;

  insert into public.academy_participation
    (academy_session_id, external_user_id, room_role, first_joined_at, active_joined_at, updated_at)
  values (v_identity.academy_session_id, v_identity.external_user_id,
    v_identity.room_role, p_occurred_at,
    case when p_event = 'join' then p_occurred_at else null end, p_occurred_at)
  on conflict (academy_session_id, external_user_id) do nothing;

  if p_event = 'join' then
    update public.academy_participation set
      active_joined_at = coalesce(active_joined_at, p_occurred_at),
      updated_at = greatest(updated_at, p_occurred_at)
    where academy_session_id = v_identity.academy_session_id
      and external_user_id = v_identity.external_user_id
      and p_occurred_at >= updated_at;
  else
    update public.academy_participation set
      duration_seconds = duration_seconds + case when active_joined_at is null then 0
        else greatest(0, extract(epoch from (p_occurred_at - active_joined_at))::bigint) end,
      last_left_at = greatest(coalesce(last_left_at, p_occurred_at), p_occurred_at),
      active_joined_at = null,
      updated_at = greatest(updated_at, p_occurred_at)
    where academy_session_id = v_identity.academy_session_id
      and external_user_id = v_identity.external_user_id
      and p_occurred_at >= updated_at;
  end if;
end $$;
revoke all on function public.record_academy_participation(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_academy_participation(uuid,text,timestamptz) to service_role;

create or replace function public.finalize_academy_participation(
  p_academy_session_id text, p_occurred_at timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_participation set
    duration_seconds = duration_seconds + case when active_joined_at is null then 0
      else greatest(0, extract(epoch from (p_occurred_at - active_joined_at))::bigint) end,
    last_left_at = case when active_joined_at is null then last_left_at else p_occurred_at end,
    active_joined_at = null,
    updated_at = greatest(updated_at, p_occurred_at)
  where academy_session_id = p_academy_session_id;
end $$;
revoke all on function public.finalize_academy_participation(text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_academy_participation(text,timestamptz) to service_role;

create trigger academy_live_sessions_updated_at before update on public.academy_live_sessions
for each row execute function private.set_updated_at();
