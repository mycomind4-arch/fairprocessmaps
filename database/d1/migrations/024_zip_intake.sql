-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 024: ZIP bundle intake
--
-- Supports POST /api/v1/cases/[id]/expand-zip: a ZIP evidence row is expanded
-- into one evidence row per entry. These columns let the expansion be
-- idempotent (never re-expand the same ZIP) and let the grouping heuristics
-- see the archive's folder structure, which is often already one folder per
-- document.
--
-- Apply with:
--   wrangler d1 execute fairprocess --file=database/d1/migrations/024_zip_intake.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- A ZIP evidence row is marked expanded once its entries have been written as
-- their own evidence rows, so it is never re-expanded and never itself sent to
-- a model as if it were a readable document.
ALTER TABLE evidence ADD COLUMN expanded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN expanded_at TEXT;

-- Lineage back to the ZIP an entry came from, and the path it held inside the
-- archive (sanitized, forward-slash separated, no leading slash). The path is
-- a strong grouping signal — a ZIP delivered as one folder per document is a
-- proposed grouping the heuristics should not have to rediscover from
-- filenames alone.
ALTER TABLE evidence ADD COLUMN source_zip_evidence_id TEXT REFERENCES evidence(id);
ALTER TABLE evidence ADD COLUMN zip_entry_path TEXT;

CREATE INDEX IF NOT EXISTS idx_evidence_source_zip ON evidence(source_zip_evidence_id);

-- Dedupe on sha256_hash is the cost-gating backbone (see docs/policy-packs.md
-- and the intake brief): re-uploading the same bundle, or the same file
-- inside two different bundles, must never re-bill a model read.
CREATE INDEX IF NOT EXISTS idx_evidence_sha256_scope
  ON evidence(project_id, organization_id, sha256_hash);
