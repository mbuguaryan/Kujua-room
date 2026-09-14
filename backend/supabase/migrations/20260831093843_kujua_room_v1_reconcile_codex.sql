alter table public.sessions
  add column if not exists media_provider text not null default 'cloudflare-realtimekit',
  add column if not exists provider_meeting_id text,
  add column if not exists media_created_at timestamptz,
  add column if not exists ends_at timestamptz;

do $$ begin
  alter table public.sessions
    add constraint sessions_media_provider_check
    check (media_provider = 'cloudflare-realtimekit');
exception when duplicate_object then null; end $$;

alter table public.session_participants
  add column if not exists "current_role" public.room_role;

update public.session_participants
set "current_role" = role_snapshot
where "current_role" is null;

alter table public.session_participants
  alter column "current_role" set default 'audience'::public.room_role,
  alter column "current_role" set not null;

create unique index if not exists sessions_one_live_per_room
  on public.sessions(room_id)
  where status = 'live'::public.session_status;

create index if not exists sessions_provider_meeting_idx
  on public.sessions(provider_meeting_id)
  where provider_meeting_id is not null;

create index if not exists session_participants_current_role_idx
  on public.session_participants(session_id, "current_role")
  where left_at is null;

create table if not exists public.rate_limits (
  rate_key text not null,
  bucket text not null,
  window_started_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (rate_key, bucket)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

create or replace function private.consume_rate_limit(
  p_rate_key text,
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_rate_key is null or p_rate_key = '' or p_bucket is null or p_bucket = '' then
    raise exception 'Rate limit key and bucket are required';
  end if;
  if p_window_seconds <= 0 or p_limit <= 0 then
    raise exception 'Rate limit window and limit must be positive';
  end if;
  select window_started_at, hit_count into v_window_start, v_count
  from public.rate_limits
  where rate_key = p_rate_key and bucket = p_bucket
  for update;
  if not found then
    insert into public.rate_limits(rate_key, bucket, window_started_at, hit_count)
    values (p_rate_key, p_bucket, v_now, 1);
    return true;
  end if;
  if v_window_start + make_interval(secs => p_window_seconds) <= v_now then
    update public.rate_limits set window_started_at = v_now, hit_count = 1, updated_at = v_now
    where rate_key = p_rate_key and bucket = p_bucket;
    return true;
  end if;
  if v_count >= p_limit then return false; end if;
  update public.rate_limits set hit_count = hit_count + 1, updated_at = v_now
  where rate_key = p_rate_key and bucket = p_bucket;
  return true;
end;
$$;

revoke all on function private.consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function private.consume_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.redeem_room_invite_server(
  p_user_id uuid,
  p_room_slug text,
  p_display_name text,
  p_invite_token text
)
returns table(room_id uuid, role public.room_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_invite public.room_invites%rowtype;
  v_hash text;
  v_name text;
  v_role public.room_role;
begin
  if p_user_id is null then raise exception 'User id required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'User not found'; end if;
  v_name := left(trim(coalesce(p_display_name,'')),80);
  if v_name = '' then raise exception 'Display name required'; end if;
  if coalesce(length(p_invite_token),0) < 16 then raise exception 'Invalid invitation'; end if;
  select * into v_room from public.rooms where slug = p_room_slug and status = 'active' for share;
  if not found then raise exception 'Room not found'; end if;
  v_hash := encode(extensions.digest(p_invite_token,'sha256'),'hex');
  select * into v_invite from public.room_invites where room_id = v_room.id and token_hash = v_hash for update;
  if not found or v_invite.revoked_at is not null or (v_invite.expires_at is not null and v_invite.expires_at <= now()) or (v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses) then
    raise exception 'Invitation is invalid or expired';
  end if;
  insert into public.profiles(user_id, display_name)
  values (p_user_id, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.room_members(room_id,user_id,role,status)
  values(v_room.id,p_user_id,v_invite.role,'active')
  on conflict(room_id,user_id) do update
    set role = case when public.room_members.role='host' then public.room_members.role else excluded.role end,
        status='active', updated_at=now();
  update public.room_invites set uses_count = uses_count + 1, updated_at = now() where id = v_invite.id;
  select rm.role into v_role from public.room_members rm where rm.room_id=v_room.id and rm.user_id=p_user_id;
  insert into public.audit_log(actor_user_id,room_id,action,metadata)
  values(p_user_id,v_room.id,'room_joined_via_invite',jsonb_build_object('invite_id',v_invite.id));
  return query select v_room.id, v_role;
end;
$$;

revoke all on function public.redeem_room_invite_server(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.redeem_room_invite_server(uuid,text,text,text) to service_role;

revoke execute on function public.create_room_invite(uuid,public.room_role,timestamptz,integer) from anon, authenticated;
revoke execute on function public.create_session(uuid,text,text,timestamptz) from anon, authenticated;
revoke execute on function public.start_session(uuid) from anon, authenticated;
revoke execute on function public.end_session(uuid) from anon, authenticated;
revoke execute on function public.resolve_stage_request(uuid,boolean) from anon, authenticated;
revoke execute on function public.revoke_room_invite(uuid) from anon, authenticated;
revoke execute on function public.set_member_role(uuid,uuid,public.room_role) from anon, authenticated;
revoke execute on function public.update_session_notes(uuid,text,text,jsonb) from anon, authenticated;
revoke execute on function public.join_room_with_invite(text,text,text) from anon, authenticated;

grant execute on function public.get_room_by_slug(text) to authenticated;
grant execute on function public.get_active_session(uuid) to authenticated;
grant execute on function public.join_live_session(uuid,text) to authenticated;
grant execute on function public.leave_live_session(uuid) to authenticated;

drop policy if exists audit_log_select_host on public.audit_log;
revoke all on public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.audit_log to service_role;

revoke all on public.room_invites from anon, authenticated;
grant select, insert, update, delete on public.room_invites to service_role;

revoke insert, update, delete on public.media_participants from anon, authenticated;
grant select, insert, update, delete on public.media_participants to service_role;;
