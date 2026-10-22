-- Дашборд магазину: записи користувача, push-підписки, журнал сповіщень.
-- Кожен користувач бачить і змінює лише свої рядки (Row Level Security).

-- Усі записи застосунку: одна таблиця, рядок = один запис колекції.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null check (collection ~ '^[a-z_]{1,32}$'),
  id         text        not null check (char_length(id) between 1 and 100),
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  -- Лише для нагадувань: момент спрацювання (UTC). За ним сервер надсилає сповіщення.
  due_at     timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id),
  constraint records_data_size check (pg_column_size(data) < 200000)
);
create index if not exists records_due_idx on public.records (due_at) where due_at is not null and not deleted;

alter table public.records enable row level security;
drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
drop policy if exists records_delete on public.records;
create policy records_select on public.records for select to authenticated using (user_id = (select auth.uid()));
create policy records_insert on public.records for insert to authenticated with check (user_id = (select auth.uid()));
create policy records_update on public.records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy records_delete on public.records for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.records to authenticated;

-- Web push підписки (пристрої, на які можна надсилати сповіщення).
create table if not exists public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures   int         not null default 0
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Журнал сповіщень. Унікальність (user_id, reminder_id, fire_at) гарантує,
-- що одне спрацювання нагадування не буде надіслано двічі.
create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  reminder_id text        not null,
  fire_at     timestamptz not null,
  title       text        not null default '',
  body        text        not null default '',
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  push_sent   int         not null default 0,
  push_failed int         not null default 0,
  unique (user_id, reminder_id, fire_at)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
drop policy if exists notif_update on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Атомарно «забирає» нагадування, час яких настав, і записує їх у журнал.
-- Повертає лише нові рядки: якщо функцію викличуть двічі або паралельно,
-- те саме спрацювання вдруге не повернеться (on conflict do nothing).
-- Нагадування, прострочені більш ніж на добу (наприклад, після простою), не надсилаються.
create or replace function public.claim_due_reminders(max_rows int default 200)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, reminder_id, fire_at, title, body)
  select r.user_id, r.id, r.due_at,
         left(coalesce(r.data->>'title', 'Нагадування'), 200),
         left(coalesce(r.data->>'note', ''), 500)
  from public.records r
  where r.collection = 'reminders' and not r.deleted
    and r.due_at is not null and r.due_at <= now() and r.due_at > now() - interval '1 day'
  order by r.due_at
  limit max_rows
  on conflict (user_id, reminder_id, fire_at) do nothing
  returning *;
$$;
revoke all on function public.claim_due_reminders(int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function public.claim_due_reminders(int) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function public.claim_due_reminders(int) from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function public.claim_due_reminders(int) to service_role'; end if;
end $$;

-- Синхронізація між пристроями в реальному часі.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'records') then
    execute 'alter publication supabase_realtime add table public.records';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
