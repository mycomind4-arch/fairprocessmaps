-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 013: Proposal Lineage
--
-- When an agent-proposed relationship is accepted and promoted to the
-- relationships table, the new relationship should carry a direct reference
-- to the proposal that created it.
--
-- This completes the provenance chain:
--
--   Agent Run → Proposal → Accepted Proposal → Relationship → Review
--
-- Every accepted edge can now answer:
--   "Why does this relationship exist?"
--   "Which agent proposed it?"
--   "Who reviewed the proposal?"
--   "Who reviewed the relationship?"
--
-- Before: lineage was buried in JSON notes (promoted_from_proposal).
-- After: lineage is a queryable column with an index.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE relationships ADD COLUMN created_from_proposal_id TEXT REFERENCES agent_proposals(id);

-- Index for looking up relationships by their source proposal
CREATE INDEX IF NOT EXISTS idx_rel_from_proposal ON relationships(created_from_proposal_id);

-- Backfill: migrate existing promoted_from_proposal from JSON notes to the column
-- (only for rows where notes contains promoted_from_proposal)
UPDATE relationships
SET created_from_proposal_id = json_extract(notes, '$.promoted_from_proposal')
WHERE created_from_proposal_id IS NULL
  AND notes IS NOT NULL
  AND json_extract(notes, '$.promoted_from_proposal') IS NOT NULL;
