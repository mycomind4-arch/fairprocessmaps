-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012: Agent Infrastructure
--
-- Phase 3.1: Agent Infrastructure Layer
--
-- Four tables:
--   agent_definitions  — registered agent types (versioned, capability-scoped)
--   agent_runs          — execution log (input snapshot, timing, status)
--   agent_proposals     — sandbox output (observations, relationships, checks)
--   agent_feedback      — reviewer learning data (evaluation dataset)
--
-- Core principle: AI is a participant, not the source of truth.
-- Agents produce proposals. Humans review. Nothing is canonical without review.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── agent_definitions ──────────────────────────────────────────────────────
-- Registered agent types. Each agent has a unique id, version, and
-- capability set. Only registered agents can run.

CREATE TABLE IF NOT EXISTS agent_definitions (
  id TEXT PRIMARY KEY,                    -- e.g. "agent.timeline_anomaly.v1"
  name TEXT NOT NULL,                     -- human-readable name
  agent_type TEXT NOT NULL,               -- timeline_anomaly | statute_matcher | evidence_extractor | authority_mapper
  version TEXT NOT NULL,                  -- semantic version
  capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array of capability strings
  model_version TEXT,                     -- LLM model used (e.g. "claude-sonnet-4-20250514")
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (agent_type, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_def_type ON agent_definitions(agent_type);

-- ── agent_runs ──────────────────────────────────────────────────────────────
-- Execution log. Every agent invocation creates a run record.
-- Stores the input snapshot hash for reproducibility.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id),
  case_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL,

  -- Agent identification (denormalized for audit queries)
  agent_id TEXT NOT NULL,                 -- same as agent_definition_id
  agent_version TEXT NOT NULL,
  model_version TEXT,

  -- Execution metadata
  input_snapshot_hash TEXT,               -- SHA256 of input snapshot JSON
  input_snapshot TEXT,                   -- JSON: graph snapshot the agent received
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT DEFAULT 'running',          -- running | completed | failed
  proposal_count INTEGER DEFAULT 0,
  error_message TEXT,

  FOREIGN KEY (case_id) REFERENCES projects(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_case ON agent_runs(case_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_run_org ON agent_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_run_agent ON agent_runs(agent_id, started_at);

-- ── agent_proposals ─────────────────────────────────────────────────────────
-- Sandbox output. Proposals are NOT canonical knowledge.
-- They enter the review lifecycle: pending → accepted | rejected | superseded
-- Accepted proposals are promoted to canonical tables (relationships, etc.)
-- Rejected proposals stay for institutional memory.

CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  agent_run_id TEXT NOT NULL REFERENCES agent_runs(id),
  case_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL,

  -- Agent identification (denormalized)
  agent_id TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  model_version TEXT,

  -- Proposal classification
  proposal_type TEXT NOT NULL,
    -- relationship_proposal | observation | procedural_check | missing_info

  -- ── For relationship_proposal ──
  source_type TEXT,                        -- finding | evidence | property | case
  source_id TEXT,
  target_type TEXT,                        -- statute | official | department | authority
  target_id TEXT,
  relationship_type TEXT,                  -- mandated_by | references | jurisdiction_of

  -- ── For observation ──
  observation_type TEXT,                    -- timeline_gap | sequence_anomaly | missing_notice | deadline_passed | authority_gap | evidence_gap
  description TEXT,
  severity TEXT,                           -- info | warning | critical
  related_entity_type TEXT,
  related_entity_id TEXT,

  -- ── For procedural_check ──
  requirement TEXT,
  check_status TEXT,                       -- met | unclear | missing | not_applicable
  check_detail TEXT,

  -- ── For missing_info ──
  info_type TEXT,                           -- document | date | party | authority | other
  importance TEXT,                           -- critical | recommended | optional

  -- ── Provenance ──
  confidence REAL,                          -- 0.0 to 1.0
  evidence_ids TEXT,                        -- JSON array of evidence IDs
  reasoning_trace TEXT,                     -- human-readable reasoning

  -- ── Lifecycle ──
  status TEXT DEFAULT 'pending',            -- pending | accepted | rejected | superseded

  -- ── Review ──
  reviewed_by TEXT,                         -- user_id
  reviewed_by_type TEXT,                    -- human
  reviewed_at TEXT,
  review_reason TEXT,                       -- why accepted/rejected

  -- ── Supersession ──
  superseded_by TEXT REFERENCES agent_proposals(id),

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (case_id) REFERENCES projects(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_case_status ON agent_proposals(case_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_agent ON agent_proposals(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_org ON agent_proposals(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_run ON agent_proposals(agent_run_id);

-- ── agent_feedback ──────────────────────────────────────────────────────────
-- Reviewer learning data. Each proposal review creates a feedback entry.
-- This becomes the evaluation dataset for model comparison and improvement.

CREATE TABLE IF NOT EXISTS agent_feedback (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES agent_proposals(id),
  agent_id TEXT NOT NULL,                  -- which agent produced the proposal
  proposal_type TEXT NOT NULL,             -- what kind of proposal
  confidence REAL,                         -- agent's confidence at time of review

  reviewer_action TEXT NOT NULL,           -- accepted | rejected
  reviewer_id TEXT NOT NULL,               -- user_id
  reviewer_role TEXT,                      -- admin | attorney | reviewer
  review_reason TEXT,                      -- why

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (proposal_id) REFERENCES agent_proposals(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_agent ON agent_feedback(agent_id, reviewer_action);
CREATE INDEX IF NOT EXISTS idx_feedback_proposal ON agent_feedback(proposal_id);

-- ── Seed: Agent Definitions ────────────────────────────────────────────────
-- Register the four planned agent types. They start as registered but
-- not yet implemented (the registry returns null until Phase 3.2+).

INSERT INTO agent_definitions (id, name, agent_type, version, capabilities, model_version, description) VALUES
  ('agent.timeline_anomaly.v1', 'Timeline Anomaly Detector', 'timeline_anomaly', '1.0.0',
   '["observation","procedural_check","missing_info"]', NULL,
   'Detects procedural sequence anomalies in case timelines: insufficient notice periods, missed deadlines, hearing-before-notice patterns, and timeline gaps.'),
  ('agent.statute_matcher.v1', 'Statute Matcher', 'statute_matcher', '1.0.0',
   '["relationship_proposal"]', NULL,
   'Matches findings to applicable statutes and ordinances based on evidence text and jurisdiction. Proposes mandated_by relationships with confidence scores.'),
  ('agent.evidence_extractor.v1', 'Evidence Extractor', 'evidence_extractor', '1.0.0',
   '["relationship_proposal","observation"]', NULL,
   'Extracts structured metadata from evidence documents: dates, parties, referenced statutes, document type classification.'),
  ('agent.authority_mapper.v1', 'Authority Mapper', 'authority_mapper', '1.0.0',
   '["relationship_proposal","missing_info"]', NULL,
   'Maps government authorities with jurisdiction over a property and case. Proposes jurisdiction_of and overseen_by relationships.');
