-- Лічильник збоїв надсилання; після 5 збоїв поспіль підписка вважається непрацюючою й видаляється.
create or replace function public.bump_push_failure(sub_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with u as (update public.push_subscriptions set failures = failures + 1 where id = sub_id returning id, failures)
  delete from public.push_subscriptions p using u where p.id = u.id and u.failures >= 5;
$$;
revoke all on function public.bump_push_failure(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function public.bump_push_failure(uuid) from anon, authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function public.bump_push_failure(uuid) to service_role'; end if;
end $$;
