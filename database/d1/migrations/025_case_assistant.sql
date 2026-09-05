-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025: Case Assistant
--
-- A conversational, tool-using Claude session scoped to one case. Unlike
-- synthesizeCaseReview (a one-shot batch review), this is a real back-and-
-- forth where the assistant can call tools mid-conversation to read the
-- record and propose changes to it.
--
-- One thread per case for v1 — case_assistant_messages stores the raw
-- Anthropic message content blocks (JSON) in order, which is what lets a
-- conversation resume exactly where it left off, tool calls and all.
--
-- Nothing the assistant does to the record is applied automatically. A tool
-- call that would change the case (add/edit/delete a timeline event, save a
-- drafted document) is written to case_assistant_pending_actions and sits
-- there until a person approves or rejects it — see src/lib/case-assistant.ts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS case_assistant_messages (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL,
  role            TEXT NOT NULL,   -- 'user' | 'assistant' (Anthropic message roles)
  content         TEXT NOT NULL,   -- JSON: the message's content blocks, verbatim
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_case_assistant_messages_project
  ON case_assistant_messages(project_id, organization_id, created_at);

CREATE TABLE IF NOT EXISTS case_assistant_pending_actions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL,
  tool_use_id     TEXT NOT NULL,   -- Claude's tool_use block id — needed to build the tool_result reply
  tool_name       TEXT NOT NULL,
  tool_input      TEXT NOT NULL,   -- JSON: the proposed tool call's arguments, verbatim
  preview         TEXT NOT NULL,   -- human-readable description shown for approval
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  resolved_by     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_case_assistant_pending_project
  ON case_assistant_pending_actions(project_id, organization_id, status);
