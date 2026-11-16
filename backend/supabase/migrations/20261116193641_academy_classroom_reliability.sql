alter table public.academy_join_intents
  add column if not exists redemption_claim uuid,
  add column if not exists redemption_claimed_at timestamptz;

create index if not exists academy_join_intents_claim_idx
  on public.academy_join_intents (redemption_claimed_at)
  where consumed_at is null;

create or replace function public.provision_academy_classroom(
  p_academy_session_id text,
  p_external_session_id text,
  p_teacher_id text,
  p_cohort_id text,
  p_title text,
  p_scheduled_at timestamptz,
  p_room_slug text
) returns public.academy_live_sessions
language plpgsql
security definer
set search_path = '' as $$
declare
  v_mapping public.academy_live_sessions%rowtype;
  v_room_id uuid;
  v_session_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_academy_session_id, 0));

  select * into v_mapping
  from public.academy_live_sessions
  where academy_session_id = p_academy_session_id
  for update;

  if found then
    if v_mapping.teacher_external_id <> p_teacher_id
      or v_mapping.cohort_external_id <> p_cohort_id then
      raise exception 'academy_session_mapping_conflict';
    end if;
    return v_mapping;
  end if;

  insert into public.rooms (slug, name, room_type, access_mode, description)
    values (p_room_slug, p_title, 'group', 'private', 'Kujua Point Academy classroom')
    returning id into v_room_id;

  insert into public.sessions (room_id, title, status, scheduled_at)
    values (v_room_id, p_title, 'scheduled', p_scheduled_at)
    returning id into v_session_id;

  insert into public.academy_live_sessions (
    academy_session_id, external_session_id, teacher_external_id, cohort_external_id,
    room_id, session_id
  ) values (
    p_academy_session_id, p_external_session_id, p_teacher_id, p_cohort_id, v_room_id, v_session_id
  ) returning * into v_mapping;

  return v_mapping;
end $$;

revoke all on function public.provision_academy_classroom(text,text,text,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.provision_academy_classroom(text,text,text,text,text,timestamptz,text)
  to service_role;

create or replace function public.claim_academy_join_intent(
  p_token_hash text,
  p_claim uuid
) returns public.academy_join_intents
language plpgsql
security definer
set search_path = '' as $$
declare
  v_intent public.academy_join_intents%rowtype;
begin
  select * into v_intent
  from public.academy_join_intents
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
    and (redemption_claim is null
      or redemption_claimed_at < now() - interval '2 minutes')
  for update;

  if not found then raise exception 'join_intent_unavailable'; end if;

  update public.academy_join_intents
    set redemption_claim = p_claim, redemption_claimed_at = now()
  where id = v_intent.id
  returning * into v_intent;
  return v_intent;
end $$;

revoke all on function public.claim_academy_join_intent(text,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_academy_join_intent(text,uuid)
  to service_role;
