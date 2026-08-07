# FairProcessMaps — Full Product, Code, UX & AI Audit

**Date:** August 7, 2026
**Auditor:** Lead Staff Engineer / Product Architect / AI Systems Architect / Senior UX Designer
**Repository:** `mycomind4-arch/fairprocessmaps`
**Codebase:** ~63,000 lines across 263 files
**Architecture:** Next.js 15 on Cloudflare Workers (OpenNext) + D1 (SQLite) + R2 object storage

---

## 1. Executive Summary

FairProcess is an **evidence-first due-process analysis platform** focused on property code enforcement cases. It combines GIS parcel lookup, an evidence vault, automated timeline generation, a due-process rule engine, and an AI agent proposal system — all running on Cloudflare's edge network.

### What's genuinely impressive

- **The AI trust boundary is architecturally sound.** The "AI proposes, humans decide" principle is enforced at the database level (agent_proposals with pending→accepted/rejected lifecycle), the code level (neutrality validators reject forbidden phrases), and the API level (separate agent permissions). This is rare and well-executed.
- **Evidence immutability** is properly implemented — DELETE returns 405, withdrawal with provenance replaces deletion, R2 objects retained.
- **Organization isolation** is consistently applied across nearly all queries with `organization_id` scoping.
- **The agent infrastructure** (migrations 012-013) is genuinely sophisticated — input snapshot hashing for reproducibility, double-review for relationship proposals, feedback datasets for model evaluation, full provenance chain from proposal → relationship → agent run → agent definition.

### What's genuinely concerning

- **Two parallel API surfaces exist.** The original project-based routes and the newer case-based routes serve overlapping purposes with inconsistent response shapes and authorization patterns. This is the single biggest architectural issue.
- **Two parallel project pages exist.** `/project/[id]` and `/project/%5Bid%5D` are near-duplicates with slightly different features — a git artifact that creates confusion about the source of truth.
- **The analysis engine has a destructive pattern.** `runAnalysis()` does `DELETE FROM due_process_findings WHERE project_id = ?` then re-inserts all findings. This destroys finding history, loses all review state (reviewed_by, reviewed_at), and creates a race condition if two requests run concurrently.
- **Login route has no rate limiting.** The rate-limit infrastructure exists but is not applied to `/api/v1/auth/login`. This allows brute-force password attacks.
- **No transactions.** D1/SQLite supports transactions but the codebase never uses them. Multi-step operations are non-atomic.
- **The entire `backend/` Python directory, `infra/docker/`, `infra/terraform/`, and old DB migrations are dead code** — frozen reference from a superseded architecture.
- **Statutes are embedded in TypeScript** rather than loaded from the database. The statute library migration (014) seeds the database, but the statute matcher agent uses hardcoded `EMBEDDED_STATUTES` instead of querying D1.

### The product in one sentence

FairProcess is becoming a **due-process investigation platform** that helps property owners and their advocates identify procedural violations in code enforcement cases by gathering evidence, building timelines, and detecting discrepancies — with AI as a structured, reviewable participant rather than the source of truth.

### What should FairProcess become?

A **professional due-process intelligence platform** with jurisdiction-specific procedural models, continuous public-record monitoring, and evidence-backed procedural analysis — serving property owners, attorneys, and accountability researchers.

### What should it stop doing?

- Maintaining the frozen Python backend and Docker/Postgres/Neo4j infrastructure
- Running the destructive DELETE-then-INSERT analysis pattern
- Duplicating routes between project-based and case-based APIs
- Embedding statute data in TypeScript instead of the database

---

## 2. Current Architecture

### Deployed Stack

```
Browser (MapLibre GL JS)
    ↓
Cloudflare Worker (Next.js 15 via OpenNext)
    ├── /api/v1/*  → Next.js API routes (TypeScript)
    ├── D1 binding (SQLite at edge) → schema.sql + migrations 002-015
    └── R2 binding (EVIDENCE_BUCKET) → evidence files
    ↓
Humboldt County ArcGIS REST API (external, read-only)
```

### Source of Truth by Domain

| Domain | Source of Truth | Status |
|--------|-----------------|--------|
| Properties | `properties` table in D1 | ✅ Stable |
| Projects/Cases | `projects` table in D1 (new `cases` table exists but unused) | ⚠️ Confused |
| Evidence | `evidence` table in D1 + R2 objects | ✅ Solid |
| Timeline | `timeline_events` table in D1 | ✅ Stable (duplicates `events` table) |
| Findings | `due_process_findings` table in D1 | ⚠️ Destructive regeneration |
| Relationships | `relationships` table in D1 | ✅ Well-designed |
| Agent Proposals | `agent_proposals` table in D1 | ✅ Excellent |
| Agent Runs | `agent_runs` table in D1 | ✅ Excellent |
| Statutes | `statutes` table (migration 014) — but agents use hardcoded TS | ⚠️ Diverged |
| Auth | `users` + `sessions` tables in D1 | ✅ Solid |
| Audit Logs | `audit_logs` table in D1 | ✅ Append-only by convention |
| Event Store | `events` table in D1 (migration 005) | ⚠️ Partially used |
| Property Intelligence | `property_intelligence` table in D1 | ✅ Functional |

### Two Parallel Data Models

The codebase has an unresolved tension between two domain models:

1. **Original (deployed):** Property → Project → Evidence/Timeline/Findings
2. **Newer (partially built):** Organization → Case → Events/Relationships/Graph

The `cases` table (migration 004) and `events` table (migration 005) exist but most API routes still use the original `projects` table. The investigation page uses case-based routes. The project dashboard uses project-based routes. Both are accessible but show different views.

### Frozen / Dead Infrastructure

The following are from the superseded microservices architecture (ADRs 002-005) and are **not deployed**:

- `backend/api/` — FastAPI Python backend
- `backend/ai/` — Python AI agents
- `backend/ingestion/` — Python data harvesters
- `backend/workers/` — Python Temporal workflow pipelines
- `infra/docker/` — Docker Compose with PostGIS, Neo4j, Temporal, Meilisearch, MinIO
- `infra/terraform/` — Terraform for the old stack
- `database/postgis/` — PostGIS migration
- `database/neo4j/` — Neo4j schema and seed data
- `shared/types/` — Python shared types

**These constitute roughly 40% of the repository's file count but are entirely dead.**

---

## 3. Repository Health

### File count breakdown

| Area | Files | Lines (approx) | Status |
|------|-------|-----------------|--------|
| Frontend (deployed) | ~80 | ~20,000 | Active |
| Backend Python (frozen) | ~30 | ~15,000 | Dead |
| Database migrations | ~18 | ~1,200 | Active |
| Infrastructure (dead) | ~10 | ~2,000 | Dead |
| Tests | ~12 | ~1,500 | Mixed |
| Documentation | ~12 | ~5,000 | Partially stale |
| Config/scripts | ~10 | ~500 | Mixed |

### Code quality signals

**Positive:**
- TypeScript throughout deployed code with proper types
- Security centralized in `lib/security/` with clear separation
- Agent system well-documented with phase contracts
- Migration files well-commented and generally idempotent
- ADRs document architectural decisions and rationale

**Negative:**
- `any` types used liberally in API routes and analysis code
- Error handling often does `String(err)` instead of structured responses
- Response shapes inconsistent: some `{ items: [] }`, others `{ ok, data, error }`
- No ESLint configuration visible
- Both `npm` and `pnpm` lock files present

---

## 4. Critical Bugs

### P0-1: Destructive Analysis Pattern (CRITICAL)

**File:** `frontend/web/src/lib/auto-triggers.ts`, `runAnalysis()`

```typescript
await db.prepare("DELETE FROM due_process_findings WHERE project_id = ?").bind(projectId).run();
for (const finding of findings) {
  await db.prepare(`INSERT INTO due_process_findings ...`).bind(...).run();
}
```

**Problem:** Every analysis run deletes ALL findings and recreates them. This:
1. Destroys finding `status` (open/resolved/dismissed) — all user reviews lost
2. Destroys `reviewed_by` and `reviewed_at` provenance
3. Generates new UUIDs, breaking references from other tables
4. Creates race condition: concurrent requests can delete findings mid-analysis
5. Loses finding history — can't see what changed between runs

**Solution:** Use upsert/dedup with finding fingerprints (rule + evidence_id + detail hash). Preserve existing status, only insert genuinely new findings.

**Complexity:** Medium

### P0-2: Login Route Has No Rate Limiting

**File:** `frontend/web/src/app/api/v1/auth/login/route.ts`

Rate-limit infrastructure exists (`RATE_LIMITS.login = { max: 5, window: 60 }`) but login route doesn't call `checkRateLimit()`. Brute-force attacks are unthrottled.

**Solution:** Add `checkRateLimit(req, "login", 5, 60)` at top of POST handler.

**Complexity:** Trivial

### P0-3: No Transaction Support for Multi-Step Operations

Multiple API routes perform non-atomic write sequences:
- Evidence upload: INSERT evidence + timeline event + analysis (3+ writes)
- Timeline creation: INSERT event + audit + analysis (3+ writes)
- Proposal review: UPDATE proposal + INSERT feedback + INSERT relationship + emit events (4+ writes)

D1 supports `db.batch()` but it's never used. Partial failures leave inconsistent state.

**Solution:** Wrap multi-step writes in `db.batch()`.

**Complexity:** Medium

### P0-4: Timeline Events Stat Shows Wrong Count

**File:** `frontend/web/src/app/project/[id]/page.tsx`

```tsx
<span>{project?.evidenceCount ?? 0}</span>
// Label says "Timeline Events" but shows evidenceCount
```

Copy-paste bug — timeline event count shows evidence count.

### P0-5: `runAnalysis` Missing Organization Scoping

**File:** `frontend/web/src/lib/auto-triggers.ts`

Analysis queries lack `organization_id` filtering:
```typescript
db.prepare("SELECT ... FROM evidence WHERE project_id = ?")  // missing AND organization_id = ?
```

Cross-organization data leak. Solution: Add org scoping to all queries in `runAnalysis()`.

---

## 5. Security Audit

### Authentication ✅ (Mostly Solid)

- **Password hashing:** PBKDF2, 100,000 iterations via Web Crypto — industry standard
- **Session tokens:** 32 random bytes, stored as SHA-256 hash
- **Session cookies:** HttpOnly + Secure + SameSite=Strict — correct
- **Session fixation prevention:** Existing sessions destroyed before creating new ones
- **Session expiry:** 7-day TTL, checked on every request

**Issues:**
- No rate limiting on login (P0-2)
- No rate limiting on register
- No automated session cleanup for expired sessions

### Authorization ✅ (Well-Designed)

- Centralized `authorize(user, action, resource)` with 8-role permission matrix
- Agent permissions separate and read-only by design
- Resource-level org isolation enforced

**Issues:**
- Case-based routes use `authorize()` directly; project routes use `requireAuthz()` middleware — inconsistent
- Some case-based routes don't verify case belongs to user's org

### Organization Isolation ⚠️

- Nearly all project-scoped queries include `AND organization_id = ?`
- Properties intentionally shared (county data) — correct
- **Gap:** `runAnalysis()` queries don't include org scoping (P0-5)
- **Gap:** `relationships` table has no `organization_id` column — can't filter without JOIN
- **Gap:** Graph builder's relationship query lacks org scoping

### Evidence Security ✅ (Strong)

- 50 MB file size limit
- MIME type allowlist with extension fallback
- Filename sanitization (path traversal prevention)
- Safe R2 keys (`evidence/{org}/{id}/{filename}`)
- SHA-256 hash on upload
- DELETE returns 405 — evidence is immutable
- Withdrawal with provenance
- Download streams through Worker with auth checks

### CORS ⚠️

Production origins not configured. `ALLOWED_ORIGINS` only has localhost entries.

### SQL Injection ✅ (Safe)

All queries use parameterized bindings. No string concatenation in SQL.

### Rate Limiting ⚠️

Infrastructure exists but only applied to brief generation. Missing on: login, register, upload, agent runs, all other routes.

---

## 6. Data Integrity Audit

### Finding Regeneration (P0-1)

The destructive DELETE-then-INSERT in `runAnalysis()` destroys review state, breaks references, loses history.

### Dual Timeline Systems

1. `timeline_events` — used by project dashboard
2. `events` — used by investigation view

Not synchronized. Some actions write to one, not the other. They show different data.

### Duplicate Event Emission

Evidence uploads write to `timeline_events` + `audit_logs` but NOT `events`. Investigation view won't show uploads. Manual timeline events same issue — no `emitCanonicalEvent()` call.

### No Deduplication on Findings

No uniqueness constraint on `due_process_findings`. Same rule + same evidence can create duplicate findings.

### Statute Data Divergence

Migration 014 seeds `statutes` table. But `STATUTE_MATCHER_AGENT` uses `EMBEDDED_STATUTES` hardcoded array. DB updates invisible to agent.

### Missing Org Scoping

- `relationships` table: no `organization_id` column
- `events` table: has `resource_organization_id` (migration 009) but not `organization_id`

---

## 7. AI/Agent Audit

### Agent Inventory

| Agent | Type | Deployed | LLM | Quality |
|-------|------|----------|-----|---------|
| Timeline Anomaly Detector | Rule engine | ✅ | ❌ | Good — 6 rules, neutral language |
| Statute Matcher | Rule engine | ✅ | ❌ | Good — scoring, dedup |
| Evidence Extractor | Registered | ❌ | Planned | Not implemented |
| Authority Mapper | Registered | ❌ | Planned | Not implemented |
| Recon Agents (12+) | Data fetchers | ✅ | ❌ | Good — parallel, resilient |
| Analysis Agents | Rule engine | ✅ | ❌ | Partial — fact extraction |
| Brief Generator | Template engine | ✅ | Optional | Good — evidence-backed |

### Trust Boundary ✅ (Excellent)

1. **Capability validation:** allowed_outputs per agent type, rejects wrong proposal types
2. **Neutrality validation:** forbidden-phrase scanner rejects legal conclusions
3. **Confidence ceiling:** max 0.95, rejects higher
4. **Proposal lifecycle:** pending → accepted/rejected/superseded, never deleted
5. **Double review for relationships:** proposal accepted → relationship still needs human review
6. **Agent permissions read-only:** can't write canonical tables
7. **Input snapshot hashing:** SHA-256 for reproducibility
8. **Full provenance chain:** relationship → proposal → agent_run → agent_definition

### Provenance Quality ✅

Every proposal records: agent_id, agent_version, model_version, input_snapshot + hash, confidence (capped 0.95), evidence_ids, reasoning_trace, timestamp, reviewer info.

### Agent Replay ✅

Input snapshot stored in full. Same snapshot re-runnable against new agent version without destroying history.

### Agent Disagreement ⚠️

Contradictory proposals both stored as pending. No automatic detection or surfacing of disagreements.

### Missing AI Capabilities

1. **No LLM-based agents** — both deployed agents are pure rule engines
2. **No evidence extraction** (OCR + NLP)
3. **No procedure analysis** (jurisdiction-specific procedural models)
4. **No contradiction detection** (cross-source)
5. **No missing evidence agent** (gap analysis)
6. **No source reliability scoring**
7. **Statutes embedded, not DB-loaded**

---

## 8. Evidence Vault Audit

| Requirement | Status | Notes |
|------------|--------|-------|
| Persistent | ✅ | D1 + R2 |
| Immutable | ✅ | DELETE returns 405 |
| Versioned | ❌ | No file version history |
| Searchable | ⚠️ | Only by project ID, no full-text |
| Categorized | ⚠️ | Has doc_type/source, no taxonomy |
| Source-linked | ✅ | source field |
| Time-linked | ✅ | created_at, uploaded_at |
| Entity-linked | ⚠️ | Project only, not specific entities |
| Investigation-linked | ✅ | Via project_id |
| Hashable | ✅ | SHA-256 on upload |
| Auditable | ✅ | Upload/download/withdraw audited |

### Gaps

1. No OCR — only text-based files extracted
2. `ai_summary` column never populated
3. No content type detection (magic bytes)
4. No virus scanning
5. No evidence-to-entity linking (people, agencies)

---

## 9. Timeline Audit

### Current State

Flat list of events sorted by date with type, description, optional evidence link, actor provenance.

### Issues

1. Dual timeline systems not synchronized
2. No event grouping (related events not clustered)
3. No expand/collapse
4. No anomaly markers inline
5. No confidence indicators for AI events
6. No source badges (evidence/government/AI/manual)
7. No filtering by actor type or date range
8. No missing-event indicators

### Needed UX Improvements

- Event grouping by CE case or evidence source
- Inline anomaly markers (⚠️ on flagged events)
- Source badges, confidence indicators
- Filtering by event type, actor, date range
- "What's missing?" panel showing expected procedural steps

---

## 10. Graph Audit

### Current State

Built by `lib/graph/builder.ts` from D1 queries. Node types: property, case, evidence, finding, permit, ce_case, event, statute, official, department, authority, owner. Edge types: derived (table joins) + semantic (relationships table with lifecycle).

### Issues

1. No org scoping on relationships query
2. No layout optimization (force-directed only)
3. No edge explainability in UI
4. No disputed-edge markers (pending_review vs accepted)
5. No temporal filtering
6. Performance risk — all nodes/edges loaded at once

### What Works

Builder is well-structured: single module for graph data, separates derived from semantic edges, computes relevance scores, clean API shape.

---

## 11. Database Audit

### Full Evolved Schema (31 tables)

Base schema (8 tables) + migrations 002-015 (23 additional tables/columns):

1. `properties` — APN, address, zoning, acres, geometry
2. `projects` — enforcement matter (org-scoped after migration 008)
3. `evidence` — documents (org-scoped, immutable, hashed)
4. `timeline_events` — events (org-scoped, actor provenance)
5. `due_process_findings` — rule engine output (org-scoped, reviewable)
6. `building_permits` — permits (org-scoped)
7. `code_enforcement_cases` — CE cases (org-scoped)
8. `property_intelligence` — GIS cache
9. `recorder_records` — county records (org-scoped)
10. `organizations` — multi-tenant orgs
11. `organization_members` — user-org membership
12. `cases` — first-class case container (UNUSED by routes)
13. `case_projects` — junction (UNUSED)
14. `roles` — role definitions
15. `permissions` — permission registry
16. `role_permissions` — role-permission junction
17. `audit_logs` — append-only audit
18. `event_types` — event type catalog
19. `relationship_types` — relationship type catalog
20. `events` — canonical event store (partially used)
21. `relationships` — typed connections with lifecycle
22. `users` — standalone auth
23. `sessions` — session tokens
24. `bootstrap_config` — admin bootstrap
25. `agent_definitions` — registered agents (versioned)
26. `agent_runs` — execution log with input snapshot
27. `agent_proposals` — sandbox output with lifecycle
28. `agent_feedback` — reviewer learning data
29. `statutes` — statute reference library
30. `generated_briefs` — AI legal briefs
31. `rate_limit_log` — rate limiting store (NOT in any migration)

### Schema Issues

1. `relationships` table: no `organization_id` column
2. `events` table: no `organization_id` (only `resource_organization_id`)
3. `cases` table unused by any API route
4. No unique constraint on `timeline_events`
5. No foreign key enforcement (`PRAGMA foreign_keys = ON` not set)
6. `building_permits` has both `permit_status` and possibly old `status`
7. No migration version tracking table
8. `rate_limit_log` table referenced in code but never created by migration

---

## 12. API Audit

### Two API Generations

**Gen 1 (Project-based):** `/api/v1/timeline`, `/evidence`, `/findings`, `/projects`, `/properties`, `/search`, `/analyze`
- Response shape: `{ items: [], error: "..." }` or bare objects
- Auth: `requireAuth()` + `requireAuthz()`

**Gen 2 (Case-based):** `/api/v1/cases/[id]/graph`, `/timeline`, `/summary`, `/explain`, `/focus`, `/agents/*`
- Response shape: `{ ok: true, data: {}, error: null }` or `{ ok: false, data: null, error: { code, message } }`
- Auth: `requireAuth()` + direct `authorize()`

Both are live. Different shapes, different auth patterns, different data models.

### Authorization Inconsistency

Gen 1 uses middleware pattern. Gen 2 calls `authorize()` directly. Some Gen 2 routes don't verify case org ownership.

### Missing Endpoints

- No `PUT/PATCH /api/v1/projects/{id}` — can't update project metadata
- No `GET /api/v1/cases` — can't list cases
- No evidence full-text search
- No statute search
- No jurisdiction listing
- No notification endpoint for pending proposals

---

## 13. Public Data / Scraping Audit

### Deployed Recon System

12+ agents querying Humboldt County ArcGIS REST API endpoints. Parallel execution via `Promise.allSettled()`.

**Good:** Parallel, resilient, cached in D1, force re-run capability.

**Missing:**
- No retry logic
- No rate limiting on ArcGIS calls
- No change detection
- No incremental updates
- No source provenance (URL, timestamp, hash of response)
- Hardcoded to Humboldt County — no adapter pattern
- No handling of API downtime

### Frozen Python Ingestion

`backend/ingestion/` has a proper `BaseHarvester` with `fetch() → normalize() → deduplicate() → persist()`. CKAN, Socrata, and web scraper implementations exist. All dead — not deployed.

---

## 14. Performance Audit

### Frontend
- No code splitting — all panels loaded statically
- No virtual scrolling for large lists
- MapLibre + all icons loaded upfront

### API
- N+1 queries in graph builder (separate query per entity type)
- Analysis runs synchronously in request handler
- No caching (`Cache-Control: no-store` on everything)
- No pagination on graph API

### Database
- D1/SQLite has concurrent write limits
- Destructive analysis is write-heavy (DELETE + multiple INSERTs)
- `rate_limit_log` grows unbounded

---

## 15. Testing Audit

### Current Coverage

| Area | Coverage | Quality |
|------|----------|---------|
| Security (auth, authz, org isolation) | ✅ Good | Unit tests for permission matrix, upload validation |
| Timeline Anomaly Agent | ✅ Good | 5 rules with edge cases |
| Statute Matcher Agent | ✅ Good | Scoring and matching logic |
| Analysis Agents | ⚠️ Partial | Some guardrails and fact extraction |
| Integration | ⚠️ Minimal | Basic API client tests |
| E2E | ⚠️ Minimal | 2 tests, landing page only |
| Python tests | ❌ Dead | Test frozen code |

### Critical Missing Coverage

1. No tests for destructive analysis pattern
2. No tests for evidence upload flow
3. No tests for agent runner (snapshot, proposal, validation)
4. No tests for proposal review lifecycle
5. No tests for org isolation at API level
6. No tests for graph builder
7. No tests for rate limiting
8. No tests for brief generator
9. No E2E tests for authenticated flows
10. No tests for concurrent operations

---

## 16. Full UI/UX Audit

### Landing Page (`/`)
Clean, minimal, functional. Marketing tagline + login modal. No demo, screenshots, or feature explanation. No forgot-password flow.

### Dashboard (`/dashboard`)
Summary stats + project list. No search/filter, no sorting, no empty state guidance. Score shown without explanation. No indication of pending proposals.

### Project Dashboard (`/project/[id]`)
Core product. Structured header + left nav panels. Has duplicate route issue. Timeline stat bug. Recon auto-runs on every load. No loading/error states for panels. No "what changed" indicator. No agent review UI. Several panels are UI shells (Building Dept, Code Enforcement, Connectors, Admin).

### Investigation View (`/investigation/[id]`)
Newer, more sophisticated. Graph + timeline + detail panel with tabs. Silently fails on errors. No legend on graph. No way to add evidence/events. No way to run agents from UI. Disconnected from project dashboard.

### Visual Consistency
Good: Consistent dark-mode palette, Lucide icons, glass morphism header.
Issues: Two different page structures, no shared navigation, no breadcrumbs.

### Accessibility
No ARIA labels on interactive elements. Some form inputs use placeholders instead of labels. No `prefers-reduced-motion` handling. Focus states not explicitly styled.

---

## 17. Investigation UX Recommendations

### Ideal Investigation Structure

```
┌─────────────────────────────────────────────────────────┐
│ Investigation Header                                     │
│ Property · APN · Status · Jurisdiction · Score · Actions│
│ [Timeline] [Graph] [Evidence] [Findings] [AI Review]     │
├──────────────────────────────┬──────────────────────────┤
│  Main Workspace              │  Context Panel           │
│  (tabbed)                    │  (selected item detail)  │
│                              │  - Evidence preview      │
│                              │  - Provenance            │
│                              │  - AI analysis           │
│                              │  - Relationships         │
│                              │  - Review actions        │
├──────────────────────────────┴──────────────────────────┤
│ Agent Activity Bar                                       │
│ [Run Agent] [N pending proposals] [Last run: 2h ago]     │
└─────────────────────────────────────────────────────────┘
```

### Key Principles

1. **One investigation, one URL** — merge the two pages
2. **Always answer:** What am I looking at? Why does it matter? What evidence supports it? What should I do next?
3. **AI proposals visible inline** — not hidden in separate tab
4. **Timeline as default view** — most intuitive case understanding
5. **Evidence one click away** from any timeline event or finding

---

## 18. AI Capability Roadmap

### Highest-Value Missing Agents (priority order)

1. **Evidence Extraction Agent** — OCR + NLP to extract dates, names, APNs, statutes from documents. Foundation for all other intelligence. (High complexity)
2. **Procedure Analysis Agent** — compare observed events against jurisdiction-specific procedural requirements. Distinguish observed fact / procedural concern / legal conclusion. (Medium)
3. **Contradiction Agent** — cross-source conflict detection. (Medium)
4. **Missing Evidence Agent** — "What evidence would most reduce uncertainty?" (Low-Medium)
5. **Authority Mapping Agent** — which agency/official acted, what authority, what's missing. (Medium)
6. **Investigation Copilot** — synthesize all agent outputs into prioritized investigation guide. (Medium)

### AI Quality Requirements (Already Implemented)

Every AI assertion answers: agent_id, agent_version, model_version, evidence_ids, confidence (≤0.95), reasoning_trace, timestamp, reviewer info. Maintain these as new agents are added.

---

## 19. Property / GIS Opportunities

1. **Map as discovery interface** — click parcel → see all CE cases, permits, scores in area
2. **Map as investigation interface** — parcel boundary + CE case locations + hearing locations
3. **Parcel history timeline** — ownership transfers, permit history, CE history
4. **Comparative analysis** — compare due-process scores across parcels
5. **Jurisdiction monitoring map** — all monitored properties color-coded by score

### Recommendation

Add jurisdiction monitoring map only after core investigation experience is solid. Map should stay focused on due-process, not become a general GIS tool.

---

## 20. Product Strategy Assessment

### What FairProcess Is Becoming

A **due-process investigation platform** — tool for property owners, attorneys, and accountability researchers to identify procedural violations.

### Three Strongest Immediate Problems Solved

1. "Did the county follow due process?" — rule engine + timeline + findings
2. "What evidence do I have?" — evidence vault with immutability + audit trail
3. "Can I generate a legal brief?" — brief generator from findings + citations

### Three Strongest Problems It Could Solve Next

1. "Is this a systemic pattern?" — cross-case analysis
2. "What should I investigate next?" — missing evidence agent + copilot
3. "Is new public data available?" — continuous monitoring

### What Prevents Professionalization

1. Two parallel API/page systems
2. Destructive analysis pattern destroys user state
3. No real evidence extraction (no OCR/NLP)
4. Single jurisdiction only
5. No notifications or alerting
6. No multi-user collaboration beyond org membership

---

## 21. 10X Opportunities

1. **Automatic Jurisdiction Onboarding** — wizard to ingest county endpoints + ordinances
2. **Continuous Public-Record Monitoring** — alert when new county data appears
3. **Evidence-Backed Procedural Analysis Engine** — jurisdiction-specific procedural models
4. **Cross-Source Contradiction Detection** — county records vs uploaded documents
5. **Investigation Autopilot** — guided: gather → extract → timeline → agents → focus → prioritize
6. **Missing-Evidence Discovery** — identify + attempt to find via public records
7. **Institutional Knowledge Layer** — capture patterns from completed investigations
8. **Cross-Jurisdictional Intelligence** — compare procedures across counties
9. **Evidence Vault as Legal Record** — certified timestamps, chain of custody
10. **AI Research Orchestration** — multiple agents on same snapshot, surface disagreements

---

## 22. Ideal Future Architecture

*(See `docs/future-architecture.md` for full document)*

### Summary

```
Frontend (Next.js on Cloudflare Workers)
    ↓
API Layer (unified response shape, unified auth)
    ↓
Domain Layer (Investigation, Evidence, Timeline, Findings, Relationships)
    ↓
Evidence / Event / Relationship Model (unified, no dual timeline)
    ↓
AI Proposal Layer (agents propose, never canonical)
    ↓
Human Review Layer (review queues, provenance, feedback)
    ↓
Persistent Audit Layer (append-only, immutable)
    ↓
Public Data / Jurisdiction Connectors (adapter pattern)
```

### Key Decisions

1. Merge `projects` and `cases` into single `investigations` concept
2. Merge `timeline_events` and `events` into single event store
3. Replace destructive analysis with incremental finding updates (fingerprints)
4. Add `organization_id` to `relationships` and `events` tables
5. Load statutes from database
6. Add jurisdiction adapter interface
7. Wrap all multi-step writes in transactions
8. Delete frozen Python backend and old infrastructure

---

## 23. Ideal Future UX

*(See `docs/future-ux.md` for full document)*

### Four Primary Surfaces

1. **Dashboard** — jurisdiction monitoring, recent investigations, pending reviews, alerts
2. **Investigation** — unified: timeline, graph, evidence, findings, AI review in one page
3. **Map** — discovery interface showing all monitored properties with scores
4. **Settings** — organization, connectors, agents, user management

### Investigation Page (Core Experience)

- Header: property identity, status, jurisdiction, score, actions
- Left: navigation tabs (Timeline, Graph, Evidence, Findings, AI Review)
- Center: active tab content
- Right: context panel (selected item, provenance, AI analysis, review actions)
- Bottom: agent activity bar

---

## 24. Prioritized Findings

### P0 — Critical

| # | Finding | Impact |
|---|---------|--------|
| P0-1 | Destructive analysis (DELETE + INSERT findings) | Destroys review state, race condition |
| P0-2 | No rate limiting on login | Brute-force attacks |
| P0-3 | No transactions for multi-step writes | Data inconsistency |
| P0-4 | Timeline stat shows evidenceCount | Wrong data displayed |
| P0-5 | runAnalysis missing org scoping | Cross-org data leak |

### P1 — High

| # | Finding | Impact |
|---|---------|--------|
| P1-1 | Two parallel API generations | Maintenance burden, confusion |
| P1-2 | Duplicate project pages | Source of truth confusion |
| P1-3 | Dual timeline systems unsynchronized | Different views, different data |
| P1-4 | Statutes embedded in TS, not DB | Agent can't see updates |
| P1-5 | relationships table missing org_id | Can't enforce isolation |
| P1-6 | rate_limit_log table never created | Rate limiter fails silently |
| P1-7 | No OCR/NLP for evidence | Core capability missing |
| P1-8 | Recon auto-runs every page load | Unnecessary API calls |
| P1-9 | Investigation view silently fails | Blank pages, no errors |
| P1-10 | No agent review UI in project dashboard | Can't review from main UI |
| P1-11 | cases table unused | Dead schema |
| P1-12 | No FK enforcement in D1 | Referential integrity not guaranteed |
| P1-13 | Auth routes missing CORS headers | Cross-origin may fail |

### P2 — Medium

| # | Finding | Impact |
|---|---------|--------|
| P2-1 | No full-text search across evidence | Can't find by content |
| P2-2 | No notification system | Users don't know when to review |
| P2-3 | No evidence-to-entity linking | Can't link to people/agencies |
| P2-4 | No evidence versioning | Can't track changes |
| P2-5 | No jurisdiction adapter pattern | Hardcoded to one county |
| P2-6 | No source provenance for recon data | Can't verify data origin |
| P2-7 | No rate limiting on most routes | Abuse potential |
| P2-8 | No session cleanup | Sessions accumulate |
| P2-9 | Inconsistent error response shapes | Client handles multiple formats |
| P2-10 | No empty states with guidance | Users don't know what to do |
| P2-11 | No accessibility (ARIA, focus) | Excludes users |
| P2-12 | No lazy loading of panels | Performance on slow connections |
| P2-13 | No pagination on graph API | Performance for large cases |
| P2-14 | Dead Python backend/Docker/Terraform | Repository confusion |
| P2-15 | ai_summary column never populated | Missing capability |

### P3 — Future

| # | Finding | Impact |
|---|---------|--------|
| P3-1 | No cross-case pattern analysis | Can't identify systemic issues |
| P3-2 | No continuous monitoring | Manual data gathering only |
| P3-3 | No multi-jurisdiction support | Single county |
| P3-4 | No agent disagreement detection | Contradictions hidden |
| P3-5 | No source reliability scoring | Quality not tracked |
| P3-6 | No research agent | Manual research only |
| P3-7 | No institutional knowledge | Patterns not captured |
| P3-8 | No mobile-responsive design | Desktop only |
| P3-9 | No API documentation | Integration difficult |
| P3-10 | No i18n | English only |

---

## 25. Recommended Roadmap

### Phase A — Stabilize (1-2 weeks)

Fix critical bugs and security gaps. No new features.

1. Fix destructive analysis pattern — finding fingerprints + upsert
2. Add rate limiting to login (2 lines)
3. Add org scoping to runAnalysis
4. Fix timeline events stat
5. Create rate_limit_log migration
6. Wrap critical writes in db.batch()
7. Add CORS headers to auth routes

**Risk:** Low — bug fixes only

### Phase B — Consolidate (2-3 weeks)

Eliminate duplicates, unify API and pages.

1. Merge project dashboard and investigation view
2. Unify API response shapes
3. Sync/merge timeline_events and events
4. Load statutes from DB
5. Add organization_id to relationships table
6. Remove duplicate %5Bid%5D route
7. Delete frozen Python backend and old infra
8. Add proper error/empty states to all pages
9. Fix recon auto-run

**Risk:** Medium — refactoring active code
**Dependencies:** Phase A

### Phase C — Intelligence (3-4 weeks)

Add first LLM-based agent and core missing capabilities.

1. Implement Evidence Extraction Agent (OCR + NLP)
2. Implement Procedure Analysis Agent
3. Add agent proposal review UI
4. Populate ai_summary via LLM
5. Implement Contradiction Agent
6. Implement Missing Evidence Agent
7. Add notification system

**Risk:** Medium — new LLM integration
**Dependencies:** Phase B

### Phase D — Scale (2-3 weeks)

Multiple jurisdictions and continuous monitoring.

1. Jurisdiction adapter interface
2. Onboard second county
3. Continuous monitoring with change detection
4. Full-text search
5. Map as monitoring dashboard

**Risk:** Medium — new integrations
**Dependencies:** Phase C

### Phase E — Moat (ongoing)

1. Cross-jurisdictional intelligence
2. Historical datasets and trends
3. Institutional knowledge layer
4. Advanced investigation workflows
5. API for external integrations
6. Mobile-responsive design

---

## 26. Recommended Next 10 Engineering Tasks

1. **Fix destructive analysis pattern** — finding fingerprints + upsert in `runAnalysis()`
2. **Add rate limiting to login/register** — call `checkRateLimit()` in handlers
3. **Add org scoping to runAnalysis queries** — prevent cross-org leak
4. **Create migration for rate_limit_log table** — referenced but never created
5. **Merge duplicate project page routes** — delete `%5Bid%5D`, add Briefs to `[id]`
6. **Unify the timeline** — ensure `emitCanonicalEvent()` called everywhere `emitTimelineEvent()` is
7. **Load statutes from D1** — replace `EMBEDDED_STATUTES` with DB query
8. **Fix recon auto-run** — check if already completed before triggering
9. **Add error states to investigation view** — replace silent catches with visible errors
10. **Delete frozen Python backend, Docker, Terraform** — dead code cleanup

---

## Appendix: What Should FairProcess Become?

**FairProcess should become a professional due-process intelligence platform** that helps people understand complex public-record investigations quickly, accurately, and transparently — while keeping evidence and human review above AI conclusions.

It should **stop** maintaining the frozen Python backend, running destructive analysis patterns, duplicating routes, and embedding reference data in TypeScript.

It should **build next:** evidence extraction, procedural analysis, unified investigation page, agent proposal review UI, statute loading from database.

It should **not build yet:** multi-jurisdiction support, continuous monitoring, cross-case analysis — until the core investigation experience is solid and critical bugs are fixed.

**What prevents professionalization:** the destructive analysis pattern destroys user state, dual API/page systems create confusion, no real evidence extraction exists, and the investigation UX is split between two disconnected views. Fix these first, then build intelligence on a solid foundation.
