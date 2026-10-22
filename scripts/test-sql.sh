#!/usr/bin/env bash
# Перевірка міграцій бази на локальному Postgres: правила доступу (RLS) і захист від дублів сповіщень.
# Використання: PGURL=postgres://postgres@localhost/postgres scripts/test-sql.sh
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="turka_test_$$"
psql "$PGURL" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL="${PGURL%/*}/$DB"
# Міграції з pg_cron і Vault потребують Supabase; тут перевіряємо таблиці, правила доступу й захист від дублів.
MIGRATIONS=$(ls supabase/migrations/*.sql | grep -v reminder_cron)
psql "$URL" -q -v ON_ERROR_STOP=1 -f tests/sql/supabase_shim.sql
for f in $MIGRATIONS; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
# Міграції мають бути повторюваними
for f in $MIGRATIONS; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$URL" -v ON_ERROR_STOP=1 -f tests/sql/rls_test.sql
echo "SQL-тести пройдено"
