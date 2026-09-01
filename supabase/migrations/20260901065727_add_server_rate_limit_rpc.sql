create or replace function public.consume_rate_limit_server(
  p_rate_key text,
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.consume_rate_limit(
    p_rate_key,
    p_bucket,
    p_window_seconds,
    p_limit
  );
$$;

revoke all on function public.consume_rate_limit_server(text,text,integer,integer)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function public.consume_rate_limit_server(text,text,integer,integer)
  to service_role;

-- Rollback guidance:
-- 1. Revoke and drop public.consume_rate_limit_server.
-- 2. Revoke USAGE on schema private only after confirming that no other server
--    process needs it.
-- 3. Do not revoke EXECUTE on private.consume_rate_limit in this repository:
--    migration 20260831093843_kujua_room_v1_reconcile_codex.sql granted it
--    before this migration. If this migration is reused against a database where
--    it introduced that permission, and a dependency audit confirms no other
--    server process needs it, the corrective migration may conditionally run:
--
-- revoke execute on function private.consume_rate_limit(text,text,integer,integer)
--   from service_role;
