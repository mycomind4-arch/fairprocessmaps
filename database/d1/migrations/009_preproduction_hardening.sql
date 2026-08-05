-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009: Pre-Production Hardening (Phase 1E+)
--
-- Addresses four pre-production concerns from architectural review:
--   1. Resource org scoping on events (actor org ≠ resource org)
--   2. Agent version provenance
--   3. Bootstrap protection columns
--   4. Session rotation tracking
--
-- Apply with:
--   wrangler d1 execute fairprocess --file=database/d1/migrations/009_preproduction_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Resource organization on timeline_events ──────────────────────────────
-- A government_source agent (actor org = County) can create an event about
-- a property/case belonging to Organization B. We need both:
--   actor_organization_id: who performed the action
--   resource_organization_id: which org owns the affected resource
-- These are NOT always the same.

ALTER TABLE timeline_events ADD COLUMN resource_organization_id TEXT;

-- Also add to the canonical events table (migration 005)
ALTER TABLE events ADD COLUMN resource_organization_id TEXT;

-- ── 2. Agent version provenance ─────────────────────────────────────────────
-- For AI systems, which version of the agent generated a finding matters.
-- An event should record: agent_id + agent_version.

ALTER TABLE timeline_events ADD COLUMN agent_version TEXT;
ALTER TABLE events ADD COLUMN agent_version TEXT;
ALTER TABLE due_process_findings ADD COLUMN generated_by_agent TEXT;
ALTER TABLE due_process_findings ADD COLUMN agent_version TEXT;

-- ── 3. Session rotation tracking ─────────────────────────────────────────────
-- Track session rotations to detect fixation attacks.
-- rotated_from: the previous session that was destroyed on login.

ALTER TABLE sessions ADD COLUMN rotated_from TEXT;

-- ── 4. Bootstrap environment token ───────────────────────────────────────────
-- Store a hash of the bootstrap token so the endpoint can verify it.
-- The actual token is set as an environment variable (BOOTSTRAP_TOKEN).
-- This table stores only the hash for verification.

CREATE TABLE IF NOT EXISTS bootstrap_config (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  token_hash TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
