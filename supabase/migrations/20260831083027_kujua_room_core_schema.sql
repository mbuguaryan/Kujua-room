create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

do $$ begin
  create type public.room_role as enum ('host','moderator','speaker','audience');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.room_status as enum ('active','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('scheduled','live','ended','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stage_request_status as enum ('pending','approved','declined','cancelled','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active','blocked','revoked');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  room_type text not null default 'conference' check (room_type in ('coaching','group','conference')),
  access_mode text not null default 'invite' check (access_mode in ('invite','private','public')),
  capacity integer not null default 500 check (capacity between 2 and 5000),
  stage_capacity integer not null default 12 check (stage_capacity between 1 and 100),
  status public.room_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage_capacity <= capacity)
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.room_role not null default 'audience',
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  agenda text,
  status public.session_status not null default 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role_snapshot public.room_role not null default 'audience',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  presence_state jsonb not null default '{}'::jsonb,
  client_instance_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id),
  check (left_at is null or left_at >= joined_at)
);

create table if not exists public.session_notes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table if not exists public.stage_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.stage_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stage_requests_one_pending_per_user
  on public.stage_requests(session_id, user_id)
  where status = 'pending';

create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role public.room_role not null default 'audience' check (role <> 'host'),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses is null or uses_count <= max_uses)
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('mute','unmute','promote_moderator','demote_moderator','promote_speaker','demote_speaker','remove_participant','block_member','end_session')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.media_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'cloudflare-realtimekit' check (provider in ('cloudflare-realtimekit')),
  provider_meeting_id text,
  provider_participant_id text,
  provider_preset_name text,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id),
  unique (provider, provider_participant_id)
);

create index if not exists room_members_user_idx on public.room_members(user_id, status);
create index if not exists sessions_room_status_idx on public.sessions(room_id, status, scheduled_at);
create index if not exists session_participants_session_joined_idx on public.session_participants(session_id, joined_at);
create index if not exists session_participants_user_idx on public.session_participants(user_id, joined_at desc);
create index if not exists stage_requests_session_status_idx on public.stage_requests(session_id, status, requested_at);
create index if not exists room_invites_room_idx on public.room_invites(room_id, expires_at);
create index if not exists moderation_events_session_idx on public.moderation_events(session_id, created_at desc);
create index if not exists audit_log_room_idx on public.audit_log(room_id, created_at desc);
create index if not exists audit_log_session_idx on public.audit_log(session_id, created_at desc);
create index if not exists media_participants_session_idx on public.media_participants(session_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is null then
    v_name := 'Guest';
  end if;
  v_name := left(v_name, 80);

  insert into public.profiles(user_id, display_name)
  values (new.id, v_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_new_user() from anon;
revoke all on function private.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created_kujua_room on auth.users;
create trigger on_auth_user_created_kujua_room
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.profiles(user_id, display_name)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'name'), ''), 'Guest'), 80)
from auth.users u
on conflict (user_id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['profiles','rooms','room_members','sessions','session_participants','session_notes','private_notes','stage_requests','room_invites','media_participants'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

insert into public.rooms(slug, name, description, room_type, access_mode, capacity, stage_capacity)
values ('mens-conference', 'Men''s Conference', 'Kujua Room voice conference for the Men''s Conference movement.', 'conference', 'invite', 500, 12)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  room_type = excluded.room_type,
  access_mode = excluded.access_mode,
  capacity = excluded.capacity,
  stage_capacity = excluded.stage_capacity,
  updated_at = now();;
