alter table public.sessions
  add column if not exists goals text;
