#!/usr/bin/env bash
# Local development bootstrap for FairProcess.
#
# Builds the local D1 database from scratch — schema, every migration in order,
# then the demo case — and reports any migration that fails instead of stopping
# at the first one. Run from the repo root.
#
# Node 20's npm is broken on this machine (walk-up-path MODULE_NOT_FOUND), so
# this pins Node 22 explicitly rather than relying on whatever nvm last set.
set -uo pipefail

NODE22="$HOME/.nvm/versions/node/v22.22.3/bin"
if [ -d "$NODE22" ]; then export PATH="$NODE22:$PATH"; fi

cd "$(dirname "$0")/frontend/web" || exit 1
echo "node $(node -v)"

DB=fairprocess
run() { npx wrangler d1 execute "$DB" --local --yes "$@" 2>&1; }

echo
echo "── schema ─────────────────────────────────────────"
out=$(run --file=../../database/d1/schema.sql)
if grep -q "ERROR" <<<"$out"; then
  echo "FAILED: $(grep -oE 'ERROR\].*' <<<"$out" | head -1)"
else
  echo "ok  schema.sql"
fi

echo
echo "── migrations ─────────────────────────────────────"
fail=0
for f in ../../database/d1/migrations/*.sql; do
  out=$(run --file="$f")
  if grep -q "ERROR" <<<"$out"; then
    echo "FAIL  $(basename "$f")  →  $(grep -oE 'ERROR\].*' <<<"$out" | head -1)"
    fail=$((fail+1))
  else
    echo "ok    $(basename "$f")"
  fi
done

echo
echo "── demo case ──────────────────────────────────────"
out=$(run --file=../../database/d1/seed_demo_case.sql)
if grep -q "ERROR" <<<"$out"; then
  echo "seed skipped (already present or failed): $(grep -oE 'ERROR\].*' <<<"$out" | head -1)"
else
  echo "ok    seed_demo_case.sql"
fi

# Jurisdiction drives policy pack selection; the demo seed predates the column.
run --command "UPDATE properties SET county='Humboldt County' WHERE county IS NULL" >/dev/null

echo
echo "── verify ─────────────────────────────────────────"
run --command "SELECT
  (SELECT COUNT(*) FROM organizations) AS orgs,
  (SELECT COUNT(*) FROM projects)      AS cases,
  (SELECT COUNT(*) FROM timeline_events) AS events,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table') AS tables" | grep -A6 '"results"'

echo
echo "migrations failed: $fail"
echo "next: cd frontend/web && npx wrangler dev --port 8788"
