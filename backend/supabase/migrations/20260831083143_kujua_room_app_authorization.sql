create or replace function private.is_room_member(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.room_members rm where rm.room_id=p_room_id and rm.user_id=p_user_id and rm.status='active'); $$;

create or replace function private.has_room_role(p_room_id uuid, p_roles public.room_role[], p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.room_members rm where rm.room_id=p_room_id and rm.user_id=p_user_id and rm.status='active' and rm.role=any(p_roles)); $$;

create or replace function private.can_manage_session(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sessions s join public.room_members rm on rm.room_id=s.room_id where s.id=p_session_id and rm.user_id=p_user_id and rm.status='active' and rm.role in ('host','moderator')); $$;

create or replace function private.is_session_participant(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.session_participants sp where sp.session_id=p_session_id and sp.user_id=p_user_id); $$;

revoke all on function private.is_room_member(uuid,uuid) from public, anon, authenticated;
revoke all on function private.has_room_role(uuid,public.room_role[],uuid) from public, anon, authenticated;
revoke all on function private.can_manage_session(uuid,uuid) from public, anon, authenticated;
revoke all on function private.is_session_participant(uuid,uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid,uuid) to authenticated;
grant execute on function private.has_room_role(uuid,public.room_role[],uuid) to authenticated;
grant execute on function private.can_manage_session(uuid,uuid) to authenticated;
grant execute on function private.is_session_participant(uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_notes enable row level security;
alter table public.private_notes enable row level security;
alter table public.stage_requests enable row level security;
alter table public.room_invites enable row level security;
alter table public.moderation_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.media_participants enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

drop policy if exists rooms_select_member on public.rooms;
create policy rooms_select_member on public.rooms for select to authenticated using (private.is_room_member(id));

drop policy if exists room_members_select_member on public.room_members;
create policy room_members_select_member on public.room_members for select to authenticated using (private.is_room_member(room_id));

drop policy if exists sessions_select_member on public.sessions;
create policy sessions_select_member on public.sessions for select to authenticated using (private.is_room_member(room_id));

drop policy if exists session_participants_select_member on public.session_participants;
create policy session_participants_select_member on public.session_participants for select to authenticated using (private.is_room_member(room_id));
drop policy if exists session_participants_update_self on public.session_participants;
create policy session_participants_update_self on public.session_participants for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

drop policy if exists session_notes_select_member on public.session_notes;
create policy session_notes_select_member on public.session_notes for select to authenticated using (exists (select 1 from public.sessions s where s.id=session_id and private.is_room_member(s.room_id)));

drop policy if exists private_notes_select_self on public.private_notes;
create policy private_notes_select_self on public.private_notes for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists private_notes_insert_self on public.private_notes;
create policy private_notes_insert_self on public.private_notes for insert to authenticated with check ((select auth.uid())=user_id and private.is_session_participant(session_id));
drop policy if exists private_notes_update_self on public.private_notes;
create policy private_notes_update_self on public.private_notes for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists private_notes_delete_self on public.private_notes;
create policy private_notes_delete_self on public.private_notes for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists stage_requests_select_relevant on public.stage_requests;
create policy stage_requests_select_relevant on public.stage_requests for select to authenticated using ((select auth.uid())=user_id or private.can_manage_session(session_id));
drop policy if exists stage_requests_insert_self on public.stage_requests;
create policy stage_requests_insert_self on public.stage_requests for insert to authenticated with check ((select auth.uid())=user_id and private.is_session_participant(session_id));
drop policy if exists stage_requests_update_self_cancel on public.stage_requests;
create policy stage_requests_update_self_cancel on public.stage_requests for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and status in ('pending','cancelled'));

drop policy if exists media_participants_select_self_or_manager on public.media_participants;
create policy media_participants_select_self_or_manager on public.media_participants for select to authenticated using ((select auth.uid())=user_id or private.can_manage_session(session_id));

drop policy if exists moderation_events_select_managers on public.moderation_events;
create policy moderation_events_select_managers on public.moderation_events for select to authenticated using (private.can_manage_session(session_id));

drop policy if exists audit_log_select_host on public.audit_log;
create policy audit_log_select_host on public.audit_log for select to authenticated using (room_id is not null and private.has_room_role(room_id,array['host']::public.room_role[]));

grant select,update on public.profiles to authenticated;
grant select on public.rooms,public.room_members,public.sessions,public.session_notes to authenticated;
grant select,update on public.session_participants to authenticated;
grant select,insert,update,delete on public.private_notes to authenticated;
grant select,insert,update on public.stage_requests to authenticated;
grant select on public.media_participants,public.moderation_events,public.audit_log to authenticated;
revoke all on public.room_invites from anon,authenticated;

create or replace function public.join_room_with_invite(p_room_slug text,p_display_name text,p_invite_token text)
returns table(room_id uuid,role public.room_role)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid:=auth.uid(); v_room public.rooms%rowtype; v_invite public.room_invites%rowtype; v_hash text; v_name text;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 v_name:=left(trim(coalesce(p_display_name,'')),80); if v_name='' then raise exception 'Display name required'; end if;
 if coalesce(length(p_invite_token),0)<16 then raise exception 'Invalid invitation'; end if;
 select * into v_room from public.rooms where slug=p_room_slug and status='active' for share; if not found then raise exception 'Room not found'; end if;
 v_hash:=encode(extensions.digest(p_invite_token,'sha256'),'hex');
 select * into v_invite from public.room_invites where room_id=v_room.id and token_hash=v_hash for update;
 if not found or v_invite.revoked_at is not null or (v_invite.expires_at is not null and v_invite.expires_at<=now()) or (v_invite.max_uses is not null and v_invite.uses_count>=v_invite.max_uses) then raise exception 'Invitation is invalid or expired'; end if;
 update public.profiles set display_name=v_name,updated_at=now() where user_id=v_user_id; if not found then insert into public.profiles(user_id,display_name) values(v_user_id,v_name); end if;
 insert into public.room_members(room_id,user_id,role,status) values(v_room.id,v_user_id,v_invite.role,'active') on conflict(room_id,user_id) do update set role=case when public.room_members.role='host' then public.room_members.role else excluded.role end,status='active',updated_at=now();
 update public.room_invites set uses_count=uses_count+1,updated_at=now() where id=v_invite.id;
 insert into public.audit_log(actor_user_id,room_id,action,metadata) values(v_user_id,v_room.id,'room_joined_via_invite',jsonb_build_object('invite_id',v_invite.id));
 return query select v_room.id,(select rm.role from public.room_members rm where rm.room_id=v_room.id and rm.user_id=v_user_id);
end; $$;
revoke all on function public.join_room_with_invite(text,text,text) from public,anon;
grant execute on function public.join_room_with_invite(text,text,text) to authenticated;

create or replace function public.join_live_session(p_session_id uuid,p_client_instance_id text default null)
returns table(participant_id uuid,room_id uuid,role public.room_role,display_name text)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid:=auth.uid(); v_session public.sessions%rowtype; v_member public.room_members%rowtype; v_profile public.profiles%rowtype; v_participant_id uuid;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 select * into v_session from public.sessions where id=p_session_id and status in ('scheduled','live'); if not found then raise exception 'Session unavailable'; end if;
 select * into v_member from public.room_members where room_id=v_session.room_id and user_id=v_user_id and status='active'; if not found then raise exception 'Room access denied'; end if;
 select * into v_profile from public.profiles where user_id=v_user_id;
 insert into public.session_participants(session_id,room_id,user_id,display_name,role_snapshot,client_instance_id,left_at,last_seen_at) values(v_session.id,v_session.room_id,v_user_id,coalesce(v_profile.display_name,'Guest'),v_member.role,p_client_instance_id,null,now()) on conflict(session_id,user_id) do update set display_name=excluded.display_name,role_snapshot=excluded.role_snapshot,client_instance_id=excluded.client_instance_id,left_at=null,last_seen_at=now(),updated_at=now() returning id into v_participant_id;
 return query select v_participant_id,v_session.room_id,v_member.role,coalesce(v_profile.display_name,'Guest');
end; $$;
revoke all on function public.join_live_session(uuid,text) from public,anon;
grant execute on function public.join_live_session(uuid,text) to authenticated;

create or replace function public.leave_live_session(p_session_id uuid)
returns void language sql security definer set search_path = ''
as $$ update public.session_participants set left_at=now(),last_seen_at=now(),updated_at=now() where session_id=p_session_id and user_id=auth.uid(); $$;
revoke all on function public.leave_live_session(uuid) from public,anon;
grant execute on function public.leave_live_session(uuid) to authenticated;;
