create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  message_type text not null default 'text' check (message_type = 'text'),
  created_at timestamptz not null default now()
);
create index room_messages_session_created_idx on public.room_messages(session_id, created_at desc, id desc);
create index room_messages_recipient_idx on public.room_messages(recipient_id, created_at desc) where recipient_id is not null;
alter table public.room_messages enable row level security;
create policy room_messages_select_visible on public.room_messages for select to authenticated using (
  private.is_session_participant(session_id) and
  (recipient_id is null or sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
);
revoke all on public.room_messages from anon;
grant select on public.room_messages to authenticated;
grant select,insert,update,delete on public.room_messages to service_role;
alter publication supabase_realtime add table public.room_messages;
