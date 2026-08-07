# FairProcess — Ideal Future Architecture

**Date:** August 7, 2026
**Status:** Recommendation (not yet implemented)

---

## Overview

This document describes the architecture FairProcess should evolve toward. It builds on the existing Cloudflare Workers + D1 + R2 stack — no infrastructure changes needed. The changes are structural: unify data models, eliminate duplicates, and add missing layers.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Next.js 15 on Cloudflare Workers via OpenNext)    │
│  - Unified Investigation Page (merges project + case views) │
│  - Dashboard with jurisdiction monitoring                    │
│  - Map with property discovery                              │
│  - Settings (org, connectors, agents, users)                │
├─────────────────────────────────────────────────────────────┤
│ API Layer (Next.js API routes)                             │
│  - Unified response shape: { ok, data, error }              │
│  - Unified auth: requireAuth() + requireAuthz() everywhere  │
│  - Rate limiting on all sensitive endpoints                  │
│  - Transactions for all multi-step writes                    │
├─────────────────────────────────────────────────────────────┤
│ Domain Layer                                                │
│  - InvestigationService (merges project + case)              │
│  - EvidenceService (immutable, hashed, versioned)          │
│  - TimelineService (unified event store)                     │
│  - FindingService (incremental, fingerprinted)              │
│  - RelationshipService (lifecycle, provenance)              │
│  - AgentService (proposal lifecycle)                        │
├─────────────────────────────────────────────────────────────┤
│ Evidence / Event / Relationship Model                       │
│  - Single event store (merges timeline_events + events)     │
│  - Evidence with entity linking + AI extraction             │
│  - Relationships with org scoping + lifecycle                │
│  - Findings with fingerprints + preserved review state      │
│  - Statutes loaded from DB (not embedded)                   │
├─────────────────────────────────────────────────────────────┤
│ AI Proposal Layer                                           │
│  - Agents produce proposals only (never canonical)          │
│  - Capability + neutrality validators                       │
│  - Input snapshot hashing for replay                        │
│  - Confidence ceiling (0.95)                                │
│  - Agent disagreement detection                             │
├─────────────────────────────────────────────────────────────┤
│ Human Review Layer                                          │
│  - Review queues (pending proposals across all cases)      │
│  - Double review for relationships                          │
│  - Feedback dataset for model evaluation                    │
│  - Provenance chain: proposal → run → agent → definition    │
├─────────────────────────────────────────────────────────────┤
│ Persistent Audit Layer                                      │
│  - Append-only audit_logs (never UPDATE/DELETE)             │
│  - Evidence immutability (withdraw, not delete)              │
│  - SHA-256 hashing on all evidence                          │
│  - Full actor provenance (human/agent/system/gov_source)    │
├─────────────────────────────────────────────────────────────┤
│ Public Data / Jurisdiction Connectors                       │
│  - JurisdictionAdapter interface (not hardcoded URLs)       │
│  - Per-county: ArcGIS, code enforcement, permits, recorder  │
│  - Change detection + incremental updates                   │
│  - Source provenance (URL, timestamp, response hash)       │
│  - Retry + rate limiting on external calls                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

### 1. Merge `projects` and `cases` into `investigations`

**Current:** `projects` table (used by most routes) and `cases` table (migration 004, unused). Both represent the same concept.

**Future:** Single `investigations` table. The `cases` table is dropped. All routes use `investigations`. The `case_projects` junction is removed.

**Migration:** Rename `projects` to `investigations` (or add a view). All API routes update from `project_id` to `investigation_id`. Frontend updates from `/project/[id]` to `/investigation/[id]`.

### 2. Merge `timeline_events` and `events` into single event store

**Current:** `timeline_events` (project dashboard) and `events` (investigation view) are not synchronized.

**Future:** Single `events` table. All event emissions go through one function that writes to both the event store and the audit log. The event store has:
- `id`, `investigation_id`, `event_date`, `event_type`, `description`
- `evidence_id` (optional link to evidence)
- `actor_type`, `actor_id`, `actor_organization_id`, `resource_organization_id`
- `agent_version` (if AI-generated)
- `source_system`, `source_record_id` (for imported events)
- `severity`, `title`, `payload`
- `organization_id` (for direct org scoping)
- `created_at`

### 3. Replace destructive analysis with incremental finding updates

**Current:** `DELETE FROM due_process_findings WHERE project_id = ?` then re-insert all.

**Future:** Findings have a `finding_fingerprint` (hash of rule + evidence_id + detail). On analysis:
1. Compute new findings
2. For each new finding, check if a finding with the same fingerprint exists
3. If exists: skip (preserve status, reviewed_by, reviewed_at)
4. If new: insert with status='open'
5. For existing findings not in new set: mark as 'stale' (don't delete — they may have been resolved)

### 4. Add `organization_id` to `relationships` and `events` tables

**Current:** These tables lack `organization_id`, requiring JOINs for org isolation.

**Future:** Both tables get `organization_id` column. All queries include `AND organization_id = ?` directly.

### 5. Load statutes from database

**Current:** `EMBEDDED_STATUTES` hardcoded array in `statute-matcher.ts`.

**Future:** Agent runner loads statutes from `statutes` table as part of the input snapshot. The agent receives statutes in `AgentInputSnapshot.statutes[]`. Updates to the DB are immediately visible to the agent.

### 6. Jurisdiction adapter interface

**Current:** ArcGIS URLs hardcoded to Humboldt County in `recon-agents.ts`.

**Future:**

```typescript
interface JurisdictionAdapter {
  id: string;
  name: string;
  parcels: { url: string; apnField: string; };
  codeEnforcement?: { url: string; };
  permits?: { url: string; };
  recorder?: { url: string; };
  // ... per-county configuration
}
```

Recon agents receive a `JurisdictionAdapter` and use its URLs instead of hardcoded constants. Onboarding a new county means creating a new adapter.

### 7. Transactions for all multi-step writes

**Current:** Multi-step writes (evidence upload + timeline event + analysis) are non-atomic.

**Future:** All multi-step writes wrapped in `db.batch()` (D1's transaction primitive). If any step fails, all are rolled back.

### 8. Delete frozen Python backend and old infrastructure

**Current:** `backend/`, `infra/docker/`, `infra/terraform/`, `database/postgis/`, `database/neo4j/` are dead code.

**Future:** Move to `archive/` directory or delete entirely. They serve no purpose in the deployed architecture.

---

## Database Changes

### New Migrations

```
016_unified_investigations.sql
  - Rename projects → investigations (or add view)
  - Add organization_id to relationships
  - Add organization_id to events
  - Drop cases and case_projects tables (if empty)

017_finding_fingerprints.sql
  - Add finding_fingerprint column (if not already from migration 007)
  - Add unique index on (investigation_id, finding_fingerprint)

018_rate_limit_log.sql
  - Create rate_limit_log table (referenced but never created)

019_cleanup_dead_schema.sql
  - Drop cases table (if empty)
  - Drop case_projects table (if empty)
```

### Schema Principles

1. **Every org-scoped table has `organization_id`** — no exceptions, no JOINs needed
2. **Every finding has a fingerprint** — enables upsert, preserves review state
3. **Every event has `event_date` AND `created_at`** — discovery date ≠ action date
4. **Every AI output has full provenance** — agent_id, agent_version, model_version, input_snapshot_hash
5. **Every state-changing action emits an audit event** — append-only, never mutated

---

## API Design

### Unified Response Shape

All routes return:
```typescript
{
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}
```

### Unified Auth Pattern

All routes use:
```typescript
const auth = await requireAuth(req);
if (!auth.ok) return auth.response;
const authz = requireAuthz(auth.user, action, resource);
if (!authz.ok) return authz.response;
```

### Rate Limiting

Applied to: login (5/min), register (3/hour), upload (10/min), agent_run (10/min), all other routes (120/min).

---

## Agent System Evolution

### Current → Future

| Agent | Current | Future |
|-------|---------|--------|
| Timeline Anomaly | Rule engine, ✅ deployed | Keep, add to input snapshot from DB |
| Statute Matcher | Rule engine, embedded statutes | Load statutes from DB |
| Evidence Extractor | Registered, not implemented | OCR + LLM extraction with provenance |
| Authority Mapper | Registered, not implemented | Entity resolution + statute matching |
| Procedure Analysis | Not registered | Jurisdiction-specific procedural model |
| Contradiction | Not registered | Cross-source conflict detection |
| Missing Evidence | Not registered (partial in timeline anomaly) | Dedicated gap analysis |
| Investigation Copilot | Not registered | Synthesis agent |
| Source Reliability | Not registered | Source quality scoring |

### LLM Integration

When LLM-based agents are added:
1. Model calls go through a dedicated service (not inline in route handlers)
2. Model version recorded in `agent_runs.model_version`
3. Prompt templates are versioned and stored (not inline in code)
4. Responses are validated by capability + neutrality validators (already built)
5. Every LLM call's input and output is logged for audit

### Agent Orchestration

Multiple agents can run on the same investigation snapshot. The investigation copilot:
1. Collects all agent proposals for an investigation
2. Groups by type (observations, procedural checks, relationships, missing info)
3. Prioritizes by severity and confidence
4. Surfaces disagreements (two agents contradicting each other)
5. Generates a prioritized "what to review next" list

---

## Jurisdiction Connector Architecture

```
JurisdictionAdapter (interface)
  ├── HumboldtCountyAdapter (implemented)
  │   ├── parcels: ArcGIS URL + APN field
  │   ├── codeEnforcement: (TBD)
  │   ├── permits: (TBD)
  │   └── recorder: (TBD)
  ├── SonomaCountyAdapter (future)
  │   └── ...
  └── GenericArcGISAdapter (fallback)
      └── config-driven URL mapping
```

### Properties

- Each adapter implements a standard interface
- Recon agents use the adapter, not hardcoded URLs
- Change detection: hash the API response, compare to last fetch
- Source provenance: record URL, timestamp, response hash for every fetch
- Retry: exponential backoff on failures
- Rate limiting: respect API provider's limits

---

## File Structure (Proposed)

```
fairprocessmaps/
├── frontend/web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing
│   │   │   ├── dashboard/            # Dashboard
│   │   │   ├── investigation/[id]/   # Unified investigation page
│   │   │   ├── map/                  # Map discovery
│   │   │   ├── settings/             # Settings
│   │   │   └── api/v1/              # Unified API routes
│   │   ├── components/
│   │   │   ├── panels/              # Investigation panels
│   │   │   ├── graph/               # Graph visualization
│   │   │   ├── timeline/            # Timeline components
│   │   │   └── ui/                   # Shared UI primitives
│   │   └── lib/
│   │       ├── security/            # Auth, authorization, evidence security
│   │       ├── agents/              # AI agents (registry, runner, validators)
│   │       ├── graph/               # Graph builder
│   │       ├── jurisdictions/        # Jurisdiction adapters
│   │       ├── services/            # Domain services
│   │       └── types.ts              # Shared types
├── database/d1/
│   ├── schema.sql                   # Full schema (regenerated from migrations)
│   └── migrations/                  # All migrations
├── docs/
│   ├── full-product-audit.md
│   ├── future-architecture.md
│   └── future-ux.md
└── scripts/
```

**Deleted:** `backend/`, `infra/`, `shared/`, `database/postgis/`, `database/neo4j/`

---

## Deployment

No changes needed. Still:
1. `cd frontend/web && npm install`
2. `npx wrangler d1 execute fairprocess --remote --file=database/d1/schema.sql`
3. `npx next build && npx opennextjs-cloudflare build`
4. `npx wrangler deploy`

The only difference: fewer files, cleaner structure, no dead code.
