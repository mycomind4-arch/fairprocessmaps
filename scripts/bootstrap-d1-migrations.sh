#!/usr/bin/env bash
set -euo pipefail

# FairProcessMaps historically had a live D1 schema before Wrangler's migration
# journal was initialized. This script repairs only missing compatibility columns
# and bootstraps migration history; new domain migrations are always left to Wrangler.

DB_NAME="${DB_NAME:-fairprocess}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-../../database/d1/migrations}"

run_json() { npx wrangler d1 execute "$DB_NAME" --remote --json "$@"; }
run_sql() { npx wrangler d1 execute "$DB_NAME" --remote --file="$1"; }

run_json --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);" >/dev/null
TABLE_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations';" | jq -r '.[0].results[0].count')"
MIGRATION_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM d1_migrations;" | jq -r '.[0].results[0].count')"

if [[ "$TABLE_COUNT" == "0" ]]; then
  echo "Empty D1 detected: loading the historical baseline schema before applying modern migrations."
  run_sql "$MIGRATIONS_DIR/../schema.sql"
  run_json --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('002_schema_sync.sql');" >/dev/null
fi

# Evidence evolved outside the original migration chain. Add only columns that
# are actually missing so existing production schemas are never hit by duplicate
# ALTER TABLE statements. These columns are intentionally simple data columns;
# application-level case/org checks enforce ownership.
EVIDENCE_REPAIR_SQL="$(mktemp)"
for spec in "case_id|TEXT" "organization_id|TEXT" "response_draft_id|TEXT" "mime_type|TEXT" "file_size|INTEGER" "generated_at|TEXT"; do
  column="${spec%%|*}"
  type="${spec#*|}"
  exists="$(run_json --command "SELECT COUNT(*) AS count FROM pragma_table_info('evidence') WHERE name = '${column}';" | jq -r '.[0].results[0].count')"
  if [[ "$exists" == "0" ]]; then printf "ALTER TABLE evidence ADD COLUMN %s %s;\n" "$column" "$type" >> "$EVIDENCE_REPAIR_SQL"; fi
done
if [[ -s "$EVIDENCE_REPAIR_SQL" ]]; then
  echo "Repairing missing evidence artifact columns."
  run_sql "$EVIDENCE_REPAIR_SQL"
fi
rm -f "$EVIDENCE_REPAIR_SQL"

if [[ "$MIGRATION_COUNT" != "0" ]]; then
  echo "D1 migration journal already initialized; no legacy-history bootstrap required."
  exit 0
fi

BASELINE_COUNT="$(run_json --command "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('organizations','cases','evidence','events','event_types');" | jq -r '.[0].results[0].count')"
if [[ "$BASELINE_COUNT" != "5" ]]; then
  echo "ERROR: D1 has existing tables but does not match the expected FairProcessMaps baseline."
  echo "Refusing to fabricate migration history. Inspect/export the remote schema before deployment."
  exit 1
fi

BOOTSTRAP_SQL="$(mktemp)"
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  prefix="${name%%_*}"
  if [[ "$prefix" =~ ^[0-9]+$ ]] && ((10#$prefix <= 19)); then
    escaped="${name//\'/\'\'}"
    printf "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('%s');\n" "$escaped" >> "$BOOTSTRAP_SQL"
  fi
done
if [[ ! -s "$BOOTSTRAP_SQL" ]]; then echo "ERROR: no legacy migrations were found to bootstrap."; exit 1; fi
run_sql "$BOOTSTRAP_SQL"
rm -f "$BOOTSTRAP_SQL"
echo "Bootstrapped migration history through migration 019; modern migrations will now be applied normally."
