-- ============================================================================
-- Schedule the sync-freshdesk Edge Function every 5 minutes (pg_cron + pg_net).
--
-- Run this ONCE after deploying the function — paste it into the Supabase
-- Dashboard → SQL Editor and execute. (It is intentionally NOT in migrations/
-- so `supabase db push` doesn't run it automatically.)
--
-- The Authorization header uses the publishable/anon key, which is safe to use
-- here because the function is deployed with --no-verify-jwt.
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
    url     := 'https://hagfwtqqsekoweatlzlr.supabase.co/functions/v1/sync-freshdesk',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_aQ5Y5cHX3eQSArrnof1nXg_pgmJk-gK'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- verify:  select * from cron.job;
