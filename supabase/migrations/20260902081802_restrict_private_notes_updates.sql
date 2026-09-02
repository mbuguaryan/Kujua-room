revoke update on table public.private_notes from authenticated;
grant update (content, updated_at) on table public.private_notes to authenticated;
