-- Денний ліміт запитів до AI на користувача (захист від випадкових витрат).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'Europe/Kyiv')::date,
  calls   int  not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
grant select on public.ai_usage to authenticated;

-- Збільшує лічильник і повертає true, якщо ліміт ще не вичерпано. Лише для сервера.
create or replace function public.bump_ai_usage(uid uuid, max_calls int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.ai_usage as u (user_id, day, calls) values (uid, (now() at time zone 'Europe/Kyiv')::date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning calls into n;
  return n <= max_calls;
end $$;
create or replace function public.add_ai_tokens(uid uuid, inp bigint, outp bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set input_tokens = input_tokens + inp, output_tokens = output_tokens + outp
  where user_id = uid and day = (now() at time zone 'Europe/Kyiv')::date;
$$;
revoke all on function public.bump_ai_usage(uuid, int) from public, anon, authenticated;
revoke all on function public.add_ai_tokens(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;
grant execute on function public.add_ai_tokens(uuid, bigint, bigint) to service_role;
