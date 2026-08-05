-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 011: Edge Lifecycle
--
-- Semantic edges are claims. Claims have a lifecycle:
--   pending_review → accepted | rejected | superseded
--
-- You never delete a rejected edge. It stays in the graph with
-- status='rejected' and a review reason. This preserves the full
-- reasoning history — including what was tried and discarded.
-- ═══════════════════════════════════════════════════════════════════════════

-- Edge status: pending_review (default), accepted, rejected, superseded
ALTER TABLE relationships ADD COLUMN status TEXT DEFAULT 'pending_review';

-- Review metadata
ALTER TABLE relationships ADD COLUMN reviewed_by TEXT;
ALTER TABLE relationships ADD COLUMN reviewed_by_type TEXT;
ALTER TABLE relationships ADD COLUMN reviewed_at TEXT;
ALTER TABLE relationships ADD COLUMN review_reason TEXT;

-- Superseded by: if this edge was superseded, which edge replaced it
ALTER TABLE relationships ADD COLUMN superseded_by TEXT REFERENCES relationships(id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_rel_status ON relationships(status);
CREATE INDEX IF NOT EXISTS idx_rel_case_status ON relationships(case_id, status);
