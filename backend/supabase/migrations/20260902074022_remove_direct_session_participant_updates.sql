drop policy if exists session_participants_update_self on public.session_participants;
revoke update on table public.session_participants from authenticated, anon;
