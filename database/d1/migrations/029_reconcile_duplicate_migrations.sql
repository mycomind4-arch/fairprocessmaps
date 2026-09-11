-- 029_reconcile_duplicate_migrations.sql
--
-- Migrations 015, 016, 017, 020, and 021 each got reused for two different
-- files (e.g. 016_case_communications.sql and 020_case_communications.sql).
-- For the three pairs that touched unrelated tables this was harmless. Two
-- pairs collided on the SAME table via `CREATE TABLE IF NOT EXISTS`, so
-- whichever file sorts first (016, 017) is the one that actually took
-- effect on any already-applied database, and the later file (020, 021)
-- silently did nothing:
--
--   * case_communications: 016 and 020 differ only in index naming — no
--     schema drift on the table itself, so nothing to reconcile there
--     beyond cleaning up the index set to one canonical version below.
--   * mailmypdf_webhook_events: 017 created `communication_id` as
--     `NOT NULL REFERENCES case_communications(id)`. 021 intended to relax
--     that to a nullable column with no FK, but since 017 already existed
--     under the same guard, 021's CREATE TABLE never ran. This migration
--     applies 021's intent explicitly via a table rebuild (SQLite has no
--     ALTER COLUMN / DROP CONSTRAINT).
--
-- Both fixes are safe to run once on a fresh database too: 017 and 016
-- always apply before this file regardless, so the table this migration
-- rebuilds always exists by the time it runs.

-- ── mailmypdf_webhook_events: relax communication_id (was NOT NULL + FK) ────

CREATE TABLE IF NOT EXISTS mailmypdf_webhook_events__v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  communication_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload TEXT NOT NULL
);

INSERT INTO mailmypdf_webhook_events__v2
  (id, organization_id, provider_event_id, event_type, communication_id, received_at, payload)
SELECT id, organization_id, provider_event_id, event_type, communication_id, received_at, payload
  FROM mailmypdf_webhook_events;

DROP TABLE mailmypdf_webhook_events;
ALTER TABLE mailmypdf_webhook_events__v2 RENAME TO mailmypdf_webhook_events;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailmypdf_webhook_event_unique
  ON mailmypdf_webhook_events(organization_id, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_mailmypdf_webhook_comm
  ON mailmypdf_webhook_events(communication_id, received_at DESC);

-- ── case_communications: collapse to one canonical index set ───────────────

DROP INDEX IF EXISTS idx_case_comm_case;
DROP INDEX IF EXISTS idx_case_comm_org;
DROP INDEX IF EXISTS idx_case_comm_status;
DROP INDEX IF EXISTS idx_case_comm_provider;
DROP INDEX IF EXISTS idx_case_comm_provider_job;

CREATE INDEX IF NOT EXISTS idx_case_comm_case
  ON case_communications(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comm_org
  ON case_communications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comm_status
  ON case_communications(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_case_comm_provider
  ON case_communications(provider, provider_job_id);
