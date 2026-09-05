-- 023_notice_response_workflows.sql
--
-- Notice-response workflow runs, stage results, and mail authorizations.
--
-- The table that matters here is `workflow_authorizations`. It records a human
-- authorizing an irreversible action — mailing a document to an agency — and it
-- binds that authorization to a hash of the exact content approved. Editing the
-- document after approval changes the hash, which invalidates the
-- authorization, which stops the send. That is the whole design.
--
-- Authorizations are never updated or deleted. Re-authorizing writes a new row,
-- so the record of who approved what, and when, stays intact.

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,

  -- running | awaiting_authorization | complete | failed | cancelled
  status TEXT NOT NULL DEFAULT 'running',
  current_stage TEXT,

  -- The notice that started this run.
  source_evidence_id TEXT,
  notice_type TEXT,
  service_date TEXT,

  -- Denormalized so a deadline can be listed without replaying the run.
  response_due_date TEXT,
  deadline_confidence TEXT,

  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_case ON workflow_runs(case_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org ON workflow_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
-- Supports "what is due soonest across every open matter".
CREATE INDEX IF NOT EXISTS idx_workflow_runs_due ON workflow_runs(response_due_date);

CREATE TABLE IF NOT EXISTS workflow_stage_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,

  stage_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  output TEXT,               -- JSON
  blocked_reason TEXT,
  next_action TEXT,

  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stage_results_run ON workflow_stage_results(run_id);
CREATE INDEX IF NOT EXISTS idx_stage_results_stage ON workflow_stage_results(run_id, stage_id);

-- Append-only. A row here is a person taking responsibility for an
-- irreversible act; rewriting one would destroy the only record of that.
CREATE TABLE IF NOT EXISTS workflow_authorizations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,

  stage_id TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  authorized_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- SHA-256 of the exact document text authorized. The gate compares the
  -- current document against this before sending.
  content_hash TEXT NOT NULL,

  -- What the human affirmed, in their own submission.
  attestation TEXT NOT NULL,

  -- Superseded when the document changes and someone re-authorizes.
  superseded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_authorizations_run_stage
  ON workflow_authorizations(run_id, stage_id);

-- Physical mail sent by a workflow. Complements case_communications, which
-- covers correspondence generally; this ties a specific send to the
-- authorization that permitted it.
CREATE TABLE IF NOT EXISTS workflow_mailings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,

  authorization_id TEXT NOT NULL REFERENCES workflow_authorizations(id),

  provider TEXT NOT NULL,          -- lob | mailmypdf
  provider_job_id TEXT,
  mail_class TEXT NOT NULL DEFAULT 'certified_return_receipt',
  idempotency_key TEXT NOT NULL,

  tracking_number TEXT,
  expected_delivery_date TEXT,
  proof_url TEXT,
  delivered_at TEXT,
  last_status TEXT,

  -- Evidence record created from the proof of mailing.
  proof_evidence_id TEXT,

  error_code TEXT,
  error_message TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One letter per idempotency key. A retried send must never produce a second
-- filing — duplicates confuse the record and can read as bad faith.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailings_idempotency
  ON workflow_mailings(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_mailings_run ON workflow_mailings(run_id);
CREATE INDEX IF NOT EXISTS idx_mailings_tracking ON workflow_mailings(tracking_number);
