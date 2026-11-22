-- Egg-sellent — elke 15 minuten de meldingenfunctie aanroepen (herinneringen op loopdagen en bij bestellen).
-- Uitvoeren in Supabase: SQL Editor. Pas de project-URL aan als je een ander project gebruikt.
-- Veilig om opnieuw uit te voeren. De functie stuurt elke herinnering hooguit één keer per dag per telefoon.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'egg-sellent-push';

select cron.schedule(
  'egg-sellent-push',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://istqegonfkfrkyddfajd.supabase.co/functions/v1/push',
    body := '{"mode":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_antF0IJbE25Ie9I3i_KmBQ_qxF0vR8q"}'::jsonb
  );
  $$
);

-- Thuis (v3.16) — elke 30 minuten de koppelingen bijwerken (agendalinks). De functie haalt alleen links op die langer
-- dan 25 minuten niet zijn bijgewerkt. Veilig om opnieuw uit te voeren.
select cron.unschedule(jobid) from cron.job where jobname = 'thuis-integrations';

select cron.schedule(
  'thuis-integrations',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://istqegonfkfrkyddfajd.supabase.co/functions/v1/integrations',
    body := '{"mode":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_antF0IJbE25Ie9I3i_KmBQ_qxF0vR8q"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
