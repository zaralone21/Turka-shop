-- Перевірка: ізоляція даних між користувачами та відсутність дублів сповіщень.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'a@test'), ('22222222-2222-2222-2222-222222222222', 'b@test');
grant select, insert, update, delete on all tables in schema public to service_role;

-- Користувач A створює записи
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.records (collection, id, data) values ('suppliers', 's1', '{"name":"Постачальник A"}');
insert into public.records (collection, id, data, due_at) values ('reminders', 'r1', '{"title":"Написати Олені"}', now() - interval '1 minute');
insert into public.records (collection, id, data, due_at) values ('reminders', 'r2', '{"title":"Майбутнє"}', now() + interval '1 hour');
select 'A бачить свої записи: ' || count(*) as check from public.records;

-- Користувач B не бачить і не змінює дані A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'B бачить записів A: ' || count(*) as check from public.records;
update public.records set data = '{"name":"зламано"}' where id = 's1';
delete from public.records where id = 's1';
do $$ begin
  begin
    insert into public.records (user_id, collection, id, data) values ('11111111-1111-1111-1111-111111111111', 'notes', 'x', '{}');
    raise exception 'FAIL: B зміг записати від імені A';
  exception when insufficient_privilege or check_violation then raise notice 'OK: B не може писати від імені A';
  end;
end $$;
do $$ begin
  begin
    perform public.claim_due_reminders(10);
    raise exception 'FAIL: користувач може викликати claim_due_reminders';
  exception when insufficient_privilege then raise notice 'OK: claim_due_reminders недоступна користувачам';
  end;
end $$;
select 'B бачить сповіщень A: ' || count(*) as check from public.notifications;

-- Перевірка, що дані A цілі
reset role; reset request.jwt.claim.sub;
select 'Запис A не змінено: ' || (data->>'name') as check from public.records where id = 's1';

-- Сервер забирає нагадування: перший виклик повертає 1, повторний 0
set role service_role;
select 'Перший виклик: ' || count(*) as check from public.claim_due_reminders(100);
select 'Повторний виклик: ' || count(*) as check from public.claim_due_reminders(100);
-- Відкладення змінює момент → нове спрацювання дозволене рівно один раз
update public.records set due_at = now() - interval '5 seconds' where id = 'r1';
select 'Після відкладення: ' || count(*) as check from public.claim_due_reminders(100);
select 'Ще раз: ' || count(*) as check from public.claim_due_reminders(100);
select 'Усього в журналі: ' || count(*) as check from public.notifications;

-- Фото товарів: кожен користувач працює лише зі своєю текою
reset role;
select 'Сховище фото приватне: ' || (not public)::text as check from storage.buckets where id = 'product-photos';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name) values ('product-photos', '11111111-1111-1111-1111-111111111111/p1/a.jpg');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('product-photos', '22222222-2222-2222-2222-222222222222/p1/b.jpg');
    raise exception 'FAIL: A зміг записати фото в теку B';
  exception when insufficient_privilege then raise notice 'OK: A не може писати в чужу теку';
  end;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from storage.objects) <> 0 then raise exception 'FAIL: B бачить фото A'; end if;
  raise notice 'OK: B не бачить фото A';
end $$;
delete from storage.objects;
reset role;
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'FAIL: B видалив фото A'; end if;
  raise notice 'OK: B не може видалити фото A';
end $$;
