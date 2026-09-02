revoke all privileges on table
  public.media_participants,
  public.moderation_events,
  public.private_notes,
  public.profiles,
  public.registrations,
  public.room_members,
  public.room_messages,
  public.rooms,
  public.session_notes,
  public.session_participants,
  public.sessions,
  public.stage_requests
from anon, authenticated;

grant select on table
  public.media_participants,
  public.moderation_events,
  public.profiles,
  public.room_members,
  public.room_messages,
  public.rooms,
  public.session_notes,
  public.session_participants,
  public.sessions
 to authenticated;

grant select, insert, update, delete on table public.private_notes to authenticated;
grant update on table public.profiles to authenticated;
grant select, insert, update on table public.stage_requests to authenticated;
grant insert on table public.registrations to anon;

alter function public.set_coaching_booking_updated_at() set search_path = pg_catalog;
alter function public.set_realtimekit_rooms_updated_at() set search_path = pg_catalog;

alter extension btree_gist set schema extensions;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
