create index if not exists room_messages_room_idx
  on public.room_messages(room_id);

create index if not exists room_messages_sender_idx
  on public.room_messages(sender_id);
