create or replace function public.redeem_room_invite_server(p_user_id uuid, p_room_slug text, p_display_name text, p_invite_token text)
returns table(room_id uuid, role public.room_role)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_room public.rooms%rowtype;
  v_invite public.room_invites%rowtype;
  v_hash text;
  v_name text;
  v_role public.room_role;
begin
  if p_user_id is null then raise exception 'User id required'; end if;
  if not exists (select 1 from auth.users au where au.id = p_user_id) then raise exception 'User not found'; end if;
  v_name := left(trim(coalesce(p_display_name,'')),80);
  if v_name = '' then raise exception 'Display name required'; end if;
  if coalesce(length(p_invite_token),0) < 16 then raise exception 'Invalid invitation'; end if;

  select r.* into v_room
  from public.rooms r
  where r.slug = p_room_slug and r.status = 'active'
  for share;
  if not found then raise exception 'Room not found'; end if;

  v_hash := encode(extensions.digest(p_invite_token,'sha256'),'hex');

  select ri.* into v_invite
  from public.room_invites ri
  where ri.room_id = v_room.id and ri.token_hash = v_hash
  for update;

  if not found
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses)
  then
    raise exception 'Invitation is invalid or expired';
  end if;

  insert into public.profiles(user_id, display_name)
  values (p_user_id, v_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.room_members(room_id,user_id,role,status)
  values(v_room.id,p_user_id,v_invite.role,'active')
  on conflict on constraint room_members_pkey do update
    set role = case when public.room_members.role='host' then public.room_members.role else excluded.role end,
        status='active',
        updated_at=now();

  update public.room_invites ri
  set uses_count = ri.uses_count + 1,
      updated_at = now()
  where ri.id = v_invite.id;

  select rm.role into v_role
  from public.room_members rm
  where rm.room_id = v_room.id and rm.user_id = p_user_id;

  insert into public.audit_log(actor_user_id,room_id,action,metadata)
  values(p_user_id,v_room.id,'room_joined_via_invite',jsonb_build_object('invite_id',v_invite.id));

  return query select v_room.id, v_role;
end;
$function$;

revoke all on function public.redeem_room_invite_server(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.redeem_room_invite_server(uuid,text,text,text) to service_role;
