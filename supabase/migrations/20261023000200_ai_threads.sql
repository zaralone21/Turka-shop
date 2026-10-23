-- Повна історія розмов з AI (зі сторінками сайтів, результатами інструментів) — окремо від записів,
-- бо вона може важити мегабайти. У записі розмови лишається лише видима історія.
create table if not exists public.ai_threads (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  chat_id    text        not null check (char_length(chat_id) between 1 and 100),
  messages   jsonb       not null default '[]'::jsonb,
  container  text        check (container is null or char_length(container) <= 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id),
  constraint ai_threads_size check (pg_column_size(messages) < 12000000)
);
alter table public.ai_threads enable row level security;
drop policy if exists ai_threads_own on public.ai_threads;
create policy ai_threads_own on public.ai_threads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.ai_threads to authenticated;

-- Видима історія довгої розмови може перевищити 200 КБ.
alter table public.records drop constraint if exists records_data_size;
alter table public.records add constraint records_data_size check (pg_column_size(data) < 1000000);
