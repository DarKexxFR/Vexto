#!/usr/bin/env bash
# Run the database security / anti-cheat tests against a THROWAWAY Postgres
# with PostGIS (never your production database!). Example:
#   docker run -d --name vexto-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgis/postgis:16-3.4
#   DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to a disposable Postgres+PostGIS database}"
DB="vexto_test_$$"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "create database $DB" >/dev/null
trap '"${PSQL[@]}" -c "drop database if exists $DB" >/dev/null' EXIT
BASE="${DATABASE_URL%%\?*}"
QUERY=""
if [[ "$DATABASE_URL" == *\?* ]]; then QUERY="?${DATABASE_URL#*\?}"; fi
TEST_URL="${BASE%/*}/$DB$QUERY"
T=(psql "$TEST_URL" -v ON_ERROR_STOP=1 -q)

"${T[@]}" -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do
  echo "== $(basename "$f")"
  "${T[@]}" -f "$f"
done
"${T[@]}" -f supabase/tests/security.test.sql | grep -E "ok |PASSED" || true

SEED="$(mktemp)"
node scripts/import-idfm-lines.mjs --file supabase/tests/fixtures/idfm_lines.geojson --out "$SEED" >/dev/null
"${T[@]}" -v seed="$SEED" -f supabase/tests/idfm.test.sql | grep -E "ok |PASSED" || true
rm -f "$SEED"
