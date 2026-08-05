-- Migration 007: Domain Validation — Source Identity, Temporal Relationships, Provenance
--
-- Addresses architectural gate review findings:
-- 1. Source-backed event identity (replaces semantic dedup)
-- 2. Temporal relationships (valid_from/valid_to for ownership/authority changes)
-- 3. Jurisdiction awareness in events and findings
-- 4. Effective date for government actions with delayed effect
-- 5. Source provenance tracking for imported records

-- ── Event source identity ──
-- Replaces semantic dedup (event_type + description) with structural identity:
-- same source_system + source_record_id + event_type = same event
ALTER TABLE events ADD COLUMN source_system TEXT;
ALTER TABLE events ADD COLUMN source_record_id TEXT;
ALTER TABLE events ADD COLUMN effective_date TEXT;
ALTER TABLE events ADD COLUMN jurisdiction_id TEXT;

-- Unique constraint: one event per (source_system, source_record_id, event_type)
-- Only enforced when source_system is present (manual events without source are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_identity
  ON events(source_system, source_record_id, event_type)
  WHERE source_system IS NOT NULL;

-- ── Temporal relationships ──
-- Relationships are temporal: an official's department membership, a property's owner,
-- a department's delegated authority — all change over time.
-- valid_from = when the relationship became true
-- valid_to = when it ended (NULL = currently active)
ALTER TABLE relationships ADD COLUMN valid_from TEXT;
ALTER TABLE relationships ADD COLUMN valid_to TEXT;
ALTER TABLE relationships ADD COLUMN jurisdiction_id TEXT;

-- Index for querying currently-active relationships
CREATE INDEX IF NOT EXISTS idx_relationships_active
  ON relationships(case_id, source_type, source_id, relationship_type)
  WHERE valid_to IS NULL;

-- ── Finding jurisdiction ──
-- Same statute citation may exist in different jurisdictions
ALTER TABLE due_process_findings ADD COLUMN jurisdiction_id TEXT;
ALTER TABLE due_process_findings ADD COLUMN finding_fingerprint TEXT;

-- Index for fingerprint-based dedup
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint
  ON due_process_findings(project_id, finding_fingerprint)
  WHERE finding_fingerprint IS NOT NULL;
