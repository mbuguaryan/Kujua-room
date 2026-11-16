begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_started timestamptz := '2026-11-16 16:30:00+00';
  v_duration bigint;
  v_active timestamptz;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'academy-bridge-test@example.invalid', '', now(), now());
  insert into public.rooms (id, slug, name, access_mode) values (v_room, 'academy-bridge-test', 'Academy Test', 'private');
  insert into public.sessions (id, room_id, title, status, scheduled_at)
  values (v_session, v_room, 'Academy Test', 'live', v_started);
  insert into public.academy_live_sessions
    (academy_session_id, teacher_external_id, cohort_external_id, room_id, session_id, state)
  values ('academy-session-test', 'teacher-test', 'cohort-test', v_room, v_session, 'live');
  insert into public.academy_room_identities
    (room_user_id, academy_session_id, external_user_id, room_role)
  values (v_user, 'academy-session-test', 'student-test', 'audience');

  perform public.record_academy_participation(v_user, 'join', v_started);
  perform public.record_academy_participation(v_user, 'join', v_started + interval '1 minute');
  perform public.record_academy_participation(v_user, 'leave', v_started + interval '30 minutes');
  perform public.record_academy_participation(v_user, 'leave', v_started + interval '31 minutes');
  perform public.record_academy_participation(v_user, 'join', v_started + interval '2 minutes');
  select duration_seconds, active_joined_at into v_duration, v_active
    from public.academy_participation
    where academy_session_id = 'academy-session-test' and external_user_id = 'student-test';
  if v_duration <> 1800 or v_active is not null then
    raise exception 'duplicate participation events were not idempotent: duration %, active %', v_duration, v_active;
  end if;

  perform public.record_academy_participation(v_user, 'join', v_started + interval '40 minutes');
  perform public.finalize_academy_participation('academy-session-test', v_started + interval '50 minutes');
  select duration_seconds, active_joined_at into v_duration, v_active
    from public.academy_participation
    where academy_session_id = 'academy-session-test' and external_user_id = 'student-test';
  if v_duration <> 2400 or v_active is not null then
    raise exception 'final participation duration is incorrect: %', v_duration;
  end if;
end $$;

do $$ begin
  if has_table_privilege('authenticated', 'public.academy_live_sessions', 'select')
    or has_table_privilege('anon', 'public.academy_join_intents', 'select') then
    raise exception 'browser roles have privileges on private academy bridge tables';
  end if;
end $$;

rollback;
