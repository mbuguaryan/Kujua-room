create extension if not exists pg_cron;

alter table public.sessions
  add column if not exists last_voice_activity_at timestamptz,
  add column if not exists ending_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_ending_reason_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_ending_reason_check
      check (ending_reason is null or ending_reason in ('manual', 'voice_inactivity'));
  end if;
end $$;

update public.sessions
set last_voice_activity_at = coalesce(last_voice_activity_at, started_at, created_at),
    updated_at = now()
where status = 'live'
  and last_voice_activity_at is null;

create index if not exists sessions_live_voice_activity_idx
  on public.sessions (last_voice_activity_at)
  where status = 'live' and ends_at is null;

create or replace function public.record_session_voice_activity(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_recorded_at timestamptz;
begin
  update public.sessions
  set last_voice_activity_at = v_now,
      ends_at = case
        when ending_reason = 'voice_inactivity' and ends_at > v_now then null
        else ends_at
      end,
      ending_reason = case
        when ending_reason = 'voice_inactivity' and ends_at > v_now then null
        else ending_reason
      end,
      updated_at = v_now
  where id = p_session_id
    and status = 'live'
  returning last_voice_activity_at into v_recorded_at;

  return v_recorded_at;
end;
$$;

revoke all on function public.record_session_voice_activity(uuid) from public, anon, authenticated;
grant execute on function public.record_session_voice_activity(uuid) to service_role;

create or replace function private.close_idle_voice_sessions()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  with starting_countdown as (
    update public.sessions
    set ends_at = v_now + interval '1 minute',
        ending_reason = 'voice_inactivity',
        updated_at = v_now
    where status = 'live'
      and ends_at is null
      and coalesce(last_voice_activity_at, started_at, created_at) <= v_now - interval '15 minutes'
    returning id, room_id, ends_at
  )
  insert into public.audit_log (
    actor_user_id,
    room_id,
    session_id,
    action,
    metadata,
    created_at
  )
  select
    null,
    room_id,
    id,
    'session_auto_ending',
    jsonb_build_object(
      'reason', 'voice_inactivity',
      'idle_minutes', 15,
      'ends_at', ends_at
    ),
    v_now
  from starting_countdown;

  with ended_sessions as (
    update public.sessions
    set status = 'ended',
        ended_at = coalesce(ended_at, v_now),
        updated_at = v_now
    where status = 'live'
      and ends_at is not null
      and ends_at <= v_now
    returning id, room_id, ending_reason
  ), closed_participants as (
    update public.session_participants sp
    set left_at = coalesce(sp.left_at, v_now),
        last_seen_at = v_now,
        updated_at = v_now
    where sp.left_at is null
      and sp.session_id in (select id from ended_sessions)
    returning sp.session_id
  )
  insert into public.audit_log (
    actor_user_id,
    room_id,
    session_id,
    action,
    metadata,
    created_at
  )
  select
    null,
    room_id,
    id,
    'session_auto_ended',
    jsonb_build_object('reason', coalesce(ending_reason, 'scheduled_end')),
    v_now
  from ended_sessions;
end;
$$;

revoke all on function private.close_idle_voice_sessions() from public, anon, authenticated;
grant execute on function private.close_idle_voice_sessions() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'kujua-room-close-idle-voice-sessions';

select cron.schedule(
  'kujua-room-close-idle-voice-sessions',
  '* * * * *',
  $$select private.close_idle_voice_sessions();$$
);
