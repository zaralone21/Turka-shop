-- Серверний планувальник нагадувань: щохвилини викликає функцію send-reminders.
-- Адреса проєкту й секрет зберігаються у Vault (їх записує автодеплой), а не в коді.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_send_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  -- Поки секрети не задані (бекенд ще не налаштовано), нічого не робимо.
  if base is null or secret is null then return; end if;
  perform net.http_post(
    url := base || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function public.invoke_send_reminders() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function public.invoke_send_reminders() from anon, authenticated'; end if;
end $$;

-- Створює або оновлює секрет у Vault (для автодеплою). Лише для службового доступу.
create or replace function public.set_app_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid := (select id from vault.secrets where name = secret_name);
begin
  if sid is null then perform vault.create_secret(secret_value, secret_name);
  else perform vault.update_secret(sid, secret_value); end if;
end $$;
revoke all on function public.set_app_secret(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function public.set_app_secret(text, text) from anon, authenticated'; end if;
end $$;

select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule('send-reminders', '* * * * *', 'select public.invoke_send_reminders()');
