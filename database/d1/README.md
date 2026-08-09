# FairProcessMaps D1 Database

## Migration source of truth

`database/d1/migrations/` is the source of truth for Cloudflare D1 schema evolution.

Deployments must use Wrangler's migration runner:

```bash
wrangler d1 migrations apply fairprocess --remote
```

Do not apply individual migration files with `wrangler d1 execute`. Wrangler tracks applied migrations and prevents an already-applied migration from being silently re-executed.

## `schema.sql`

`schema.sql` is retained as a historical/documentation snapshot of the original D1 schema. It is **not** a complete fresh-install schema and must not be used to provision a new production database.

A future foundation pass should generate a complete canonical snapshot from the current migration state. Until then, migrations remain authoritative.

## Migration rules

1. Never edit an already-applied migration.
2. Add a new numbered migration for every schema change.
3. A migration failure must fail deployment.
4. Migrations must be safe to run exactly once through Wrangler's migration system.
5. Destructive changes require an explicit data migration and rollback/restore plan.
6. New application code must target the canonical Case model rather than introducing new Project-centric tables.
