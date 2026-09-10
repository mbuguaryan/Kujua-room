-- Browser clients use authenticated Vercel route handlers instead of these
-- SECURITY DEFINER functions. Service-role access remains available to the
-- server boundary where a route deliberately chooses to use an RPC.
revoke execute on function public.get_room_by_slug(text)
  from public, anon, authenticated;
revoke execute on function public.get_active_session(uuid)
  from public, anon, authenticated;
revoke execute on function public.join_live_session(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.leave_live_session(uuid)
  from public, anon, authenticated;

grant execute on function public.get_room_by_slug(text) to service_role;
grant execute on function public.get_active_session(uuid) to service_role;
grant execute on function public.join_live_session(uuid, text) to service_role;
grant execute on function public.leave_live_session(uuid) to service_role;
