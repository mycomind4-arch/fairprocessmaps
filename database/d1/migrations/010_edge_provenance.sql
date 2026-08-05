-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010: Edge Provenance
--
-- Semantic relationships (from the relationships table) are claims.
-- Claims need provenance: who created the edge, when, with what confidence,
-- and what evidence supports it.
--
-- Derived relationships (from table joins) do NOT need this — they are
-- facts, not claims.
-- ═══════════════════════════════════════════════════════════════════════════

-- Provenance columns on the relationships table
ALTER TABLE relationships ADD COLUMN created_by TEXT;
ALTER TABLE relationships ADD COLUMN created_by_type TEXT DEFAULT 'system';
ALTER TABLE relationships ADD COLUMN confidence REAL DEFAULT 1.0;
ALTER TABLE relationships ADD COLUMN evidence_ids TEXT;
ALTER TABLE relationships ADD COLUMN notes TEXT;

-- Add valid_from / valid_to if they don't exist (temporal edges)
-- SQLite ALTER TABLE ADD COLUMN is idempotent if we catch the error
ALTER TABLE relationships ADD COLUMN valid_from TEXT;
ALTER TABLE relationships ADD COLUMN valid_to TEXT;
