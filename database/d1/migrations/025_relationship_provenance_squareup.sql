-- 025_relationship_provenance_squareup.sql
--
-- 010_edge_provenance.sql and 013_proposal_lineage.sql both fail atomically on
-- a fresh database, for the same reason as 024's sibling bug:
--
--   010 dies on `ALTER TABLE relationships ADD COLUMN valid_from` (schema.sql
--   already defines valid_from/valid_to), which rolls back the file's earlier
--   statements too — created_by, created_by_type, confidence, evidence_ids,
--   notes never applied.
--
--   013 dies on `UPDATE relationships SET ... = json_extract(notes, ...)`
--   because `notes` (which 010 was supposed to add) never existed, which
--   rolls back 013's own ALTER TABLE ADD COLUMN created_from_proposal_id —
--   the column its own file header describes as completing the provenance
--   chain ("Why does this relationship exist? Which agent proposed it?").
--
-- Confirmed by diffing pragma_table_info('relationships') against both files'
-- column lists: only valid_from/valid_to were present; everything below was
-- silently absent on a fresh build. This is the agent-proposal → relationship
-- provenance chain the Case Graph / Agent Proposals panel and the double-review
-- relationship endpoints depend on — a real gap, not legacy noise.
--
-- The 013 backfill (migrating old JSON-in-notes data into the new column) is
-- deliberately NOT repeated here: `notes` never existed on a fresh database, so
-- there is no legacy JSON to migrate. That backfill only matters on the one
-- production database this bug actually affected.

ALTER TABLE relationships ADD COLUMN created_by TEXT;
ALTER TABLE relationships ADD COLUMN created_by_type TEXT DEFAULT 'system';
ALTER TABLE relationships ADD COLUMN confidence REAL DEFAULT 1.0;
ALTER TABLE relationships ADD COLUMN evidence_ids TEXT;
ALTER TABLE relationships ADD COLUMN notes TEXT;
ALTER TABLE relationships ADD COLUMN created_from_proposal_id TEXT REFERENCES agent_proposals(id);

CREATE INDEX IF NOT EXISTS idx_rel_from_proposal ON relationships(created_from_proposal_id);

-- 016_missing_info_column.sql hit the same fate: `missing_info` already exists
-- on due_process_findings (schema.sql defines it), so its lone follow-on
-- statement — a partial index used to speed up "show me the missing-info
-- findings" queries — never ran. Cheap to add here; no data was ever at risk.
CREATE INDEX IF NOT EXISTS idx_findings_missing_info
  ON due_process_findings(missing_info) WHERE missing_info = 1;
