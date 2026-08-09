#!/usr/bin/env bash
set -euo pipefail

# FairProcessMaps historically had a live D1 schema before Wrangler's migration
# journal was initialized. Cloudflare records applied migrations in d1_migrations;
# without that journal Wrangler correctly treats the old files as pending and can
# replay ALTER TABLE statements against an already-built schema.
#
# This script bootstraps only migration history. It never marks new (020+) domain
# migrations as applied; those are always executed by Wrangler after the baseline.

DB_NAME="${DB_NAME:-fairprocess}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-../../database/d1/migrations}"

run_json() {
  npx wrangler d1 execute "$DB_NAME" --remote --json "$@"
}

run_sql() {
  npx wrangler d1 execute "$DB_NAME" --remote --file="$1"
}

run_json --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);" >/dev/null

TABLE_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations';" | jq -r '.[0].results[0].count')"
MIGRATION_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM d1_migrations;" | jq -r '.[0].results[0].count')"

if [[ "$MIGRATION_COUNT" != "0" ]]; then
  echo "D1 migration journal already initialized ($MIGRATION_COUNT rows); no bootstrap required."
  exit 0
fi

if [[ "$TABLE_COUNT" == "0" ]]; then
  echo "Empty D1 detected: loading the historical baseline schema before applying modern migrations."
  run_sql "$MIGRATIONS_DIR/../schema.sql"
  # schema.sql already contains the shape represented by migration 002, whose
  # ALTER TABLE statements are not safely replayable. Mark only that legacy
  # compatibility migration as applied; 003+ still run normally.
  run_json --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('002_schema_sync.sql');" >/dev/null
  exit 0
fi

BASELINE_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('organizations','cases','evidence','events','event_types');" | jq -r '.[0].results[0].count')"
if [[ "$BASELINE_COUNT" != "5" ]]; then
  echo "ERROR: D1 has existing tables but does not match the expected FairProcessMaps baseline."
  echo "Refusing to fabricate migration history. Inspect/export the remote schema before deployment."
  exit 1
fi

BOOTSTRAP_SQL="$(mktemp)"
trap 'rm -f "$BOOTSTRAP_SQL"' EXIT

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  prefix="${name%%_*}"
  if [[ "$prefix" =~ ^[0-9]+$ ]] && ((10#$prefix <= 19)); then
    escaped="${name//\'/\'\'}"
    printf "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('%s');\n" "$escaped" >> "$BOOTSTRAP_SQL"
  fi
done

if [[ ! -s "$BOOTSTRAP_SQL" ]]; then
  echo "ERROR: no legacy migrations were found to bootstrap."
  exit 1
fi

run_sql "$BOOTSTRAP_SQL"
echo "Bootstrapped migration history through migration 019; modern migrations will now be applied normally."
