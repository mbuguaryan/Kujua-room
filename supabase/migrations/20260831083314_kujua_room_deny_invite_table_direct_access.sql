drop policy if exists room_invites_no_direct_access on public.room_invites;
create policy room_invites_no_direct_access on public.room_invites
for all to authenticated
using (false)
with check (false);;
