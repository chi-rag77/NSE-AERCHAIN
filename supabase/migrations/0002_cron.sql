-- ============================================================================
-- Schedule the sync-freshdesk Edge Function every 5 minutes via pg_cron + pg_net.
--
-- BEFORE RUNNING: replace the two placeholders below:
--   <PROJECT_REF>          your Supabase project ref (e.g. abcdxyz)
--   <SUPABASE_ANON_KEY>    your project's anon key (safe to use; function has
--                          verify_jwt = false so it accepts the anon key)
--
-- Alternatively, skip this file and schedule the function from the Supabase
-- Dashboard → Edge Functions → sync-freshdesk → Cron.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove any prior schedule with the same name
select cron.unschedule('sync-freshdesk-every-5m')
where exists (select 1 from cron.job where jobname = 'sync-freshdesk-every-5m');

select cron.schedule(
  'sync-freshdesk-every-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-freshdesk',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
