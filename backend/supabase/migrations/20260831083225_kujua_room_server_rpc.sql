create or replace function private.require_room_role(p_room_id uuid,p_roles public.room_role[])
returns void
language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_room_role(p_room_id,p_roles,auth.uid()) then raise exception 'Insufficient room permission'; end if;
end; $$;
revoke all on function private.require_room_role(uuid,public.room_role[]) from public,anon,authenticated;
grant execute on function private.require_room_role(uuid,public.room_role[]) to authenticated;

create or replace function public.get_room_by_slug(p_slug text)
returns table(id uuid,slug text,name text,description text,room_type text,access_mode text,capacity integer,stage_capacity integer,status public.room_status,my_role public.room_role)
language sql stable security definer set search_path=''
as $$
 select r.id,r.slug,r.name,r.description,r.room_type,r.access_mode,r.capacity,r.stage_capacity,r.status,rm.role
 from public.rooms r join public.room_members rm on rm.room_id=r.id
 where r.slug=p_slug and rm.user_id=auth.uid() and rm.status='active';
$$;
revoke all on function public.get_room_by_slug(text) from public,anon;
grant execute on function public.get_room_by_slug(text) to authenticated;

create or replace function public.get_active_session(p_room_id uuid)
returns table(id uuid,title text,agenda text,status public.session_status,scheduled_at timestamptz,started_at timestamptz,ended_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select s.id,s.title,s.agenda,s.status,s.scheduled_at,s.started_at,s.ended_at
 from public.sessions s
 where s.room_id=p_room_id and private.is_room_member(p_room_id,auth.uid()) and s.status in ('scheduled','live')
 order by case when s.status='live' then 0 else 1 end,s.scheduled_at nulls last,s.created_at desc limit 1;
$$;
revoke all on function public.get_active_session(uuid) from public,anon;
grant execute on function public.get_active_session(uuid) to authenticated;

create or replace function public.create_room_invite(p_room_id uuid,p_role public.room_role default 'audience',p_expires_at timestamptz default null,p_max_uses integer default null)
returns table(invite_id uuid,invite_token text,expires_at timestamptz,max_uses integer,role public.room_role)
language plpgsql security definer set search_path=''
as $$
declare v_token text; v_id uuid;
begin
 perform private.require_room_role(p_room_id,array['host']::public.room_role[]);
 if p_role='host' then raise exception 'Host invites are not allowed'; end if;
 if p_max_uses is not null and p_max_uses<=0 then raise exception 'max_uses must be positive'; end if;
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.room_invites(room_id,token_hash,role,max_uses,expires_at,created_by)
 values(p_room_id,encode(extensions.digest(v_token,'sha256'),'hex'),p_role,p_max_uses,p_expires_at,auth.uid()) returning id into v_id;
 insert into public.audit_log(actor_user_id,room_id,action,metadata) values(auth.uid(),p_room_id,'invite_created',jsonb_build_object('invite_id',v_id,'role',p_role,'max_uses',p_max_uses,'expires_at',p_expires_at));
 return query select v_id,v_token,p_expires_at,p_max_uses,p_role;
end; $$;
revoke all on function public.create_room_invite(uuid,public.room_role,timestamptz,integer) from public,anon;
grant execute on function public.create_room_invite(uuid,public.room_role,timestamptz,integer) to authenticated;

create or replace function public.revoke_room_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_room_id uuid; begin
 select room_id into v_room_id from public.room_invites where id=p_invite_id;
 if v_room_id is null then raise exception 'Invite not found'; end if;
 perform private.require_room_role(v_room_id,array['host']::public.room_role[]);
 update public.room_invites set revoked_at=now(),updated_at=now() where id=p_invite_id and revoked_at is null;
 insert into public.audit_log(actor_user_id,room_id,action,metadata) values(auth.uid(),v_room_id,'invite_revoked',jsonb_build_object('invite_id',p_invite_id));
end; $$;
revoke all on function public.revoke_room_invite(uuid) from public,anon;
grant execute on function public.revoke_room_invite(uuid) to authenticated;

create or replace function public.create_session(p_room_id uuid,p_title text,p_agenda text default null,p_scheduled_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_id uuid; v_title text; begin
 perform private.require_room_role(p_room_id,array['host']::public.room_role[]);
 v_title:=left(trim(coalesce(p_title,'')),160); if v_title='' then raise exception 'Session title required'; end if;
 insert into public.sessions(room_id,title,agenda,scheduled_at,status,created_by) values(p_room_id,v_title,p_agenda,p_scheduled_at,'scheduled',auth.uid()) returning id into v_id;
 insert into public.session_notes(session_id,title,body,points,updated_by) values(v_id,v_title,'','[]'::jsonb,auth.uid());
 insert into public.audit_log(actor_user_id,room_id,session_id,action) values(auth.uid(),p_room_id,v_id,'session_created');
 return v_id;
end; $$;
revoke all on function public.create_session(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.create_session(uuid,text,text,timestamptz) to authenticated;

create or replace function public.start_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_room_id uuid; begin
 select room_id into v_room_id from public.sessions where id=p_session_id; if v_room_id is null then raise exception 'Session not found'; end if;
 perform private.require_room_role(v_room_id,array['host']::public.room_role[]);
 if exists(select 1 from public.sessions where room_id=v_room_id and status='live' and id<>p_session_id) then raise exception 'Another session is already live'; end if;
 update public.sessions set status='live',started_at=coalesce(started_at,now()),ended_at=null,updated_at=now() where id=p_session_id and status in ('scheduled','live');
 if not found then raise exception 'Session cannot be started'; end if;
 insert into public.audit_log(actor_user_id,room_id,session_id,action) values(auth.uid(),v_room_id,p_session_id,'session_started');
end; $$;
revoke all on function public.start_session(uuid) from public,anon;
grant execute on function public.start_session(uuid) to authenticated;

create or replace function public.end_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_room_id uuid; begin
 select room_id into v_room_id from public.sessions where id=p_session_id; if v_room_id is null then raise exception 'Session not found'; end if;
 perform private.require_room_role(v_room_id,array['host']::public.room_role[]);
 update public.sessions set status='ended',ended_at=now(),updated_at=now() where id=p_session_id and status in ('scheduled','live');
 update public.session_participants set left_at=coalesce(left_at,now()),last_seen_at=now(),updated_at=now() where session_id=p_session_id;
 insert into public.moderation_events(session_id,actor_user_id,action) values(p_session_id,auth.uid(),'end_session');
 insert into public.audit_log(actor_user_id,room_id,session_id,action) values(auth.uid(),v_room_id,p_session_id,'session_ended');
end; $$;
revoke all on function public.end_session(uuid) from public,anon;
grant execute on function public.end_session(uuid) to authenticated;

create or replace function public.set_member_role(p_room_id uuid,p_user_id uuid,p_role public.room_role)
returns void language plpgsql security definer set search_path=''
as $$ declare v_old public.room_role; begin
 perform private.require_room_role(p_room_id,array['host']::public.room_role[]);
 if p_user_id=auth.uid() and p_role<>'host' then raise exception 'Host cannot demote self'; end if;
 select role into v_old from public.room_members where room_id=p_room_id and user_id=p_user_id and status='active'; if v_old is null then raise exception 'Member not found'; end if;
 if v_old='host' and p_role<>'host' then raise exception 'Host role cannot be reassigned here'; end if;
 if p_role='host' and v_old<>'host' then raise exception 'Host promotion requires administrative bootstrap'; end if;
 update public.room_members set role=p_role,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
 insert into public.audit_log(actor_user_id,room_id,action,metadata) values(auth.uid(),p_room_id,'member_role_changed',jsonb_build_object('user_id',p_user_id,'old_role',v_old,'new_role',p_role));
end; $$;
revoke all on function public.set_member_role(uuid,uuid,public.room_role) from public,anon;
grant execute on function public.set_member_role(uuid,uuid,public.room_role) to authenticated;

create or replace function public.resolve_stage_request(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=''
as $$ declare v_req public.stage_requests%rowtype; v_room_id uuid; begin
 select * into v_req from public.stage_requests where id=p_request_id for update; if not found then raise exception 'Stage request not found'; end if;
 select room_id into v_room_id from public.sessions where id=v_req.session_id;
 perform private.require_room_role(v_room_id,array['host','moderator']::public.room_role[]);
 if v_req.status<>'pending' then raise exception 'Stage request already resolved'; end if;
 update public.stage_requests set status=case when p_approve then 'approved'::public.stage_request_status else 'declined'::public.stage_request_status end,resolved_at=now(),resolved_by=auth.uid(),updated_at=now() where id=p_request_id;
 if p_approve then update public.session_participants set role_snapshot='speaker',updated_at=now() where session_id=v_req.session_id and user_id=v_req.user_id; end if;
 insert into public.audit_log(actor_user_id,room_id,session_id,action,metadata) values(auth.uid(),v_room_id,v_req.session_id,'stage_request_resolved',jsonb_build_object('request_id',p_request_id,'approved',p_approve,'user_id',v_req.user_id));
end; $$;
revoke all on function public.resolve_stage_request(uuid,boolean) from public,anon;
grant execute on function public.resolve_stage_request(uuid,boolean) to authenticated;

create or replace function public.update_session_notes(p_session_id uuid,p_title text,p_body text,p_points jsonb)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if not private.can_manage_session(p_session_id,auth.uid()) then raise exception 'Insufficient session permission'; end if;
 if jsonb_typeof(coalesce(p_points,'[]'::jsonb))<>'array' then raise exception 'Points must be an array'; end if;
 insert into public.session_notes(session_id,title,body,points,updated_by) values(p_session_id,left(trim(p_title),160),coalesce(p_body,''),coalesce(p_points,'[]'::jsonb),auth.uid())
 on conflict(session_id) do update set title=excluded.title,body=excluded.body,points=excluded.points,updated_by=auth.uid(),updated_at=now();
end; $$;
revoke all on function public.update_session_notes(uuid,text,text,jsonb) from public,anon;
grant execute on function public.update_session_notes(uuid,text,text,jsonb) to authenticated;;
