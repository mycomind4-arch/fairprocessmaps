# What's wired vs. what's left

This round edits the real files in place (not new copies) — diff these
against your repo and merge, don't just overwrite.

## Architecture pivot (ADR-006, 2026-08-04)

The microservices stack (FastAPI, PostGIS, Neo4j, Temporal, Meilisearch,
MinIO, LangGraph) described in ADRs 002–005 is **superseded**. The
production stack is now:

- **Next.js API routes** (`frontend/web/src/app/api/v1/*`) on Cloudflare Workers
- **Cloudflare D1** (SQLite at edge) — schema in `database/d1/schema.sql`
- **Cloudflare R2** (S3-compatible object storage for uploaded evidence)
- **Agent-triggered workflows** (Base44) for durable orchestration
- **Humboldt County ArcGIS REST API** for parcel lookup/identification

The Python code in `backend/` is frozen reference — not deployed.
See `docs/architecture/adr.md` ADR-006 for the full rationale.

## Fully wired end-to-end
- Map click → parcel popup → **Open as project** button (`PropertyMap.tsx`)
- Button → `POST /api/v1/properties/resolve` (find-or-create Property by APN)
- → `NewProjectModal` shows existing projects for that property, or a
  create form (`GET`/`POST /api/v1/properties/[id]/projects`)
- → creating/selecting a project routes to `/project/[id]`
- → **intelligence auto-gathers** from county GIS (APN, zoning, acres, legal desc)
- → **analysis auto-runs** (due-process rules against timeline + evidence)
- Dashboard header + mini-map + nav badge read from
  `GET /api/v1/projects/[id]`, which joins property + open/critical finding counts
- Dashboard panels (Overview, Property Intelligence, Timeline, Evidence Vault,
  Discrepancies, Building Dept, Code Enforcement, Legal Library, Connectors, Admin)
  all fetch by `projectId` — ✅ done
- Humboldt County parcel click-to-identify on the map — ✅ done

## Interactive timeline — ✅ done
- `POST /api/v1/timeline?projectId=...` → add custom events (notices, hearings,
  decisions, fines, deadlines, etc.) with date + type + description
- `DELETE /api/v1/timeline?id=...&projectId=...` → remove events
- TimelinePanel has an **Add Event** form with event-type dropdown
- Adding/deleting events **auto-triggers analysis** — findings update live
- Timeline events created automatically for: evidence uploads, intelligence gathering

## Due-process analyzer — ✅ done (ported + interactive)
- Python rule engine ported to TypeScript at `frontend/web/src/lib/auto-triggers.ts`
- Rules: notice timing (10-day min), hearing right, appeal pathway
- `POST /api/v1/analyze?projectId=...` → runs rules against evidence + timeline
- `POST /api/v1/findings?projectId=...` → manually trigger analysis
- `PATCH /api/v1/findings?id=...&projectId=...` → resolve/dismiss/reopen findings
- `GET /api/v1/findings?projectId=...` → returns findings + due_process_score
- DiscrepanciesPanel has **Run Analysis** button + resolve/dismiss actions
- `rule_name` column added for human-readable rule labels
- Score: starts at 100, -20 per critical, -10 per warning (min 0)

## Evidence vault — ✅ done
- `POST /api/v1/evidence/upload` → multipart upload to R2, creates DB record
- Upload auto-creates timeline event + auto-triggers analysis
- Text extraction for text-based file types (text/, json, xml)
- `GET /api/v1/evidence?projectId=...` → list with has_file flag
- `GET /api/v1/evidence/download?id=...` → stream file from R2
- `DELETE /api/v1/evidence?id=...&projectId=...` → delete from R2 + DB + timeline refs
- R2 binding: `EVIDENCE_BUCKET` in wrangler.toml (bucket: `fairprocess-evidence`)

## Property Intelligence — ✅ done (initial)
- `POST /api/v1/intelligence?projectId=...` → queries Humboldt County GIS by APN
- Auto-triggered on project creation via `auto-triggers.ts`
- Pulls: APN, address, zoning, general plan, acres, lot size, year built,
  coastal zone, flood zone, fire responsibility, supervisor district,
  legal description, transfer date
- Creates `ai_research` evidence + `intelligence_gathered` timeline event
- Does NOT yet: scrape county websites for enforcement history, pull
  permits/inspections, cross-reference prior cases

## D1 database — ✅ done
- Database `fairprocess` (`8b5ed716-77c3-48d2-81c1-009cb01b206f`) exists remotely
- Schema applied: `properties`, `projects`, `evidence`, `evidence_relations`,
  `timeline_events`, `due_process_findings`, `building_permits`,
  `code_enforcement_cases`
- `wrangler.toml` has the real `database_id` — no placeholder
- `rule_name` column added to `due_process_findings`

## Still open
1. **Local dev needs a D1 binding** — either run `wrangler dev` (not
   `next dev`) so `getCloudflareContext()` resolves, or add a dev shim.
   Plain `next dev` won't have `env.DB` available.

2. **The old README still describes the microservices stack** — it
   should be updated to reflect the Cloudflare D1/Workers architecture,
   or at minimum point to ADR-006.

3. **Appeal pathway rule** — the rule is defined but needs timeline
   events with `appeal_filed` type to test. Currently only notice_timing
   and hearing_right rules produce findings.

4. **Evidence AI summary** — uploaded evidence has `ai_summary` column
   but nothing populates it yet. Would need an LLM call to summarize
   extracted text.

5. **Building permits & code enforcement** — API routes exist but
   don't pull real data from county systems yet. Panels are UI shells.

## Phase 1D: Trust Boundary Layer (2026-08-05)

### What's wired

- **Identity model**: users, organizations, memberships, sessions tables in D1
  (migration 004). PBKDF2 password hashing via Web Crypto. Session tokens
  stored as SHA-256 hashes — never raw.
- **Auth routes**: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
  `GET /api/v1/auth/me`. Session in httpOnly + Secure + SameSite=Strict cookie.
- **Auth middleware**: `requireAuth()` + `requireAuthz()` called in every API
  route. Unauthenticated requests get 401; unauthorized get 403.
- **Authorization**: Centralized `authorize(user, action, resource)` with a
  6-role × 13-action permission matrix. Agent permissions are separate.
- **Org isolation**: Every org-scoped table has `organization_id`. Every query
  includes `AND organization_id = ?`. Properties are shared (county data).
- **Actor provenance**: Timeline events + audit_events table record
  `actor_type` (human/agent/system/government_source), `actor_id`,
  `actor_organization_id`.
- **Evidence immutability**: DELETE returns 405. New
  `POST /api/v1/evidence/withdraw` marks evidence as withdrawn with
  provenance. R2 objects retained.
- **Upload security**: 50 MB limit, MIME allowlist, filename sanitization,
  safe R2 keys (`evidence/{org}/{id}/{filename}`), SHA-256 hash on upload.
- **Download security**: Auth → org check → permission check → withdrawal
  check → stream from R2. Audit event on every download.
- **Debug routes**: `/api/v1/debug/*` requires admin role.
- **Security tests**: `frontend/web/src/lib/security/__tests__/security.test.ts`
  covers auth, authorization, org isolation, agent security, upload validation,
  filename sanitization, R2 key safety, and actor identity.
- **Canonical dictionary**: `docs/canonical-dictionary.md` documents all
  Phase 1D contracts.

### Migration required

```bash
npx wrangler d1 execute fairprocess --remote --file=database/d1/migrations/004_trust_boundary.sql
```

### Still open

1. **Seed users** — need a CLI script or admin UI to create initial users +
   organizations + memberships.
2. **Client-side auth update** — `auth.tsx` still uses Supabase; needs to
   switch to the new `/api/v1/auth/*` endpoints.
3. **Replay validation** — the replay harness needs to verify actor
   provenance on all events.
4. **R2 signed URLs** — Cloudflare R2 Workers API doesn't support presigned
   URLs directly; we stream through the worker with auth checks instead.
   If presigned URLs become needed, use R2 S3 API with `aws-sdk` or
   migrate to R2 public buckets with lifecycle rules.

## Phase 1E: Operational Security Hardening (2026-08-05)

- **Migration fix**: Phase 1D commit accidentally overwrote migrations 004-007.
  Restored original migrations (004_identity_platform, 005_event_store,
  006_event_date, 007_domain_validation). Trust boundary migration renamed
  to 008_trust_boundary.sql. Migration 008 is now ADDITIVE — does not
  recreate tables from 004 (organizations, organization_members, audit_logs).
  Only adds users, sessions, and ALTER TABLE columns.

- **Admin bootstrap**: `POST /api/v1/admin/bootstrap` — one-time, self-disabling.
  Creates initial admin + org + membership. Refuses if any admin exists.
  `frontend/web/src/lib/security/bootstrap.ts` has the `bootstrapAdmin()` function.

- **Security audit matrix**: `docs/security-audit-matrix.md` — every route with
  auth, permission, org scoping, and event actor coverage.

- **Supabase removed**: `@supabase/supabase-js` removed from package.json.
  `auth.tsx` now uses `/api/v1/auth/*` endpoints. `LoginModal` updated.
  Landing page and dashboard no longer check `NEXT_PUBLIC_SUPABASE_URL`.
  One identity authority: FairProcess Auth.

- **Table name reconciliation**: Security code updated to use existing tables
  from migration 004: `organization_members` (not `memberships`), `audit_logs`
  (not `audit_events`). The `emitAuditEvent` function writes to `audit_logs`
  with correct column mapping.

## Phase 2.1: Graph Query API (2026-08-05)

- **Phase 2 contract**: docs/phase-2-contract.md — frozen before implementation.
  Defines node types, edge types, API response shapes, permission behavior,
  and the frontend boundary rule (UI consumes domain APIs, never tables).

- **Graph module**: frontend/web/src/lib/graph/ — the domain layer that
  builds graph responses from D1 queries. Contains types.ts (domain types)
  and builder.ts (graph construction logic).

- **Four new API routes**:
  - GET /api/v1/cases/{id}/graph — complete case graph (nodes + edges)
  - GET /api/v1/cases/{id}/timeline — ordered timeline with actor provenance
  - GET /api/v1/entities/{type}/{id}/relationships — entity relationships
  - GET /api/v1/entities/{type}/{id}/history — entity event history

- **Derived relationships**: The graph API computes edges from table joins
  (case_property, has_evidence, has_finding, has_permit, has_ce_case,
  has_recorder). Semantic relationships (supported_by, mandated_by, issued_by,
  etc.) come from the relationships table (migration 005).

- **API envelope**: All Phase 2 responses use { ok, data, error } envelope.
  Errors return { ok: false, error: { code, message } }.

- **Frontend boundary**: The frontend imports from @/lib/graph/types only.
  It never imports from builder.ts or queries D1 directly.

- **Security**: All four routes require requireAuth + requireAuthz.
  Org-scoped via the user's organization_id. Returns 404 (not 403) for
  resources not in the user's org to prevent enumeration.

## Phase 2.2: Investigation View + Edge Provenance (2026-08-05)

- **Edge provenance**: Semantic edges now carry provenance (migration 010).
  created_by, created_by_type, confidence, evidence_ids, notes. Derived edges
  carry { source: "derived" }. The distinction is clear: derived = fact,
  semantic = claim with provenance.

- **Case Summary API**: GET /api/v1/cases/{id}/summary — computed summary
  with property, jurisdiction, counts (evidence, findings, timeline),
  last action, and risk indicators (critical findings, open findings,
  overdue compliance, expired permits). The UI does not calculate this.

- **Phase 2.2 contract**: Frozen additions to docs/phase-2-contract.md.
  Investigation View Model (6 panels), Graph Interaction Rules (7 actions),
  Layout (case header + timeline/graph split + detail panel), Graph Limits
  (50 nodes / 100 edges max, with filter to narrow).

- **Investigation View**: /investigation/[id] — three-panel layout:
  - Case Header: property, jurisdiction, status, risk indicators, summary stats
  - Timeline (left, 320px): chronological events with actor provenance,
    severity colors, evidence references, agent version badges
  - Relationship Graph (right, flex): SVG-based interactive node-link diagram
    with type-filtered visibility, node selection, edge hover for provenance,
    legend distinguishing derived vs semantic edges
  - Detail Panel (bottom, 256px): tabbed (Evidence/Findings/Authority) with
    selected node details, connected edges with provenance, event details

- **Three new components**:
  - InvestigationGraph.tsx — SVG-based graph with circular layout, type colors,
    selection highlighting, edge provenance on hover
  - TimelineList.tsx — scrollable timeline with severity borders, actor icons,
    evidence references, agent version badges
  - DetailPanel.tsx — tabbed detail view showing node data, connections with
    provenance, evidence/findings/authority tabs

- **Dashboard update**: Project cards now have an "Investigate" button
  linking to /investigation/[id] alongside the existing ChevronRight link
  to /project/[id].

## Phase 2.3: Investigation Intelligence (2026-08-05)

- **Edge lifecycle (migration 011)**: Semantic edges now have status
  (pending_review/accepted/rejected/superseded) and review metadata
  (reviewed_by, reviewed_at, review_reason). Rejected edges stay in the
  graph — they are never deleted. Superseded edges are filtered from
  the graph view but remain in the database.

- **Investigation Focus API**: GET /api/v1/cases/{id}/focus — structured
  analysis with observations (timeline gaps, sequence anomalies, missing
  notice, deadline passed, authority gaps, evidence gaps), procedural
  checks (notice period, compliance deadline, etc.), missing information
  (documents, dates, parties, authorities), and supporting evidence
  summary. Uses neutral language — observations, not violations.

- **"Why am I seeing this?" API**: GET /api/v1/cases/{id}/explain?nodeId=X
  — returns reasons why a node appears in the graph: direct relationships,
  semantic edges with provenance, timeline event references, finding
  references. Every AI-derived element answers "why is this here?"

- **Edge Review API**: PATCH /api/v1/relationships/{id}/review — accepts
  or rejects semantic edges. Only pending_review edges can be reviewed.
  Admins, attorneys, and reviewers can review. Investigators cannot.
  Records who reviewed, when, and why.

- **Graph relevance scoring**: Nodes scored 0-100 based on: direct case
  relationship (+30), open findings (+20), critical findings (+10),
  processed evidence (+15), recent timeline events (+10), high-confidence
  semantic edges (+10), connected edges (+5 each, max +20). Nodes with
  relevance >= 50 show a gold arc. Node size scales with relevance.

- **Hierarchical graph layout**: Replaced circular layout with directed
  hierarchical layout. Case node at top, property below, evidence/findings
  radiate from case, permits/CE cases below property, authority chain
  (statutes, officials, departments) at the bottom. Maps to causality,
  not topology.

- **Detail Panel expanded**: New "Investigation Focus" tab with
  observations, procedural checks, missing information, and supporting
  evidence. "Why am I seeing this?" panel appears when a node is
  selected, showing all reasons with provenance, confidence, and
  review status.

- **New authorization action**: relationship.review added to the
  permission matrix. Available to admin, attorney, and reviewer roles.
  Investigators can create relationships but cannot review them.

- **Total**: 32 API routes, 11 migrations, 6 graph domain types modules.

## Phase 3 Contract: Agent Operating Model (2026-08-05)

- **Phase 3 Contract frozen**: docs/phase-3-contract.md (556 lines, 13 sections)
- **Core principle**: AI is a provenance-producing participant, not the
  source of truth. Agent outputs enter the same review lifecycle as
  any evidence-derived assertion.
- **Agent capability boundary**: Agents CAN create observations,
  evidence links, proposed relationships, procedural checks, and
  missing information requests. Agents CANNOT create legal conclusions,
  accepted relationships, final findings, authority determinations,
  or external communications.
- **Agent action record**: Every agent action records agent_id,
  agent_version, model_version, input_evidence_ids, confidence,
  reasoning_trace, and timestamp.
- **Agent sandbox**: Agents run on a read-only snapshot of the case
  graph. Output is proposals only — no writes to canonical graph.
  Proposals enter agent_proposals table (migration 012) with
  status=pending. Human review (accept/reject) before promotion.
- **Double review for AI assertions**: Accepted agent proposals that
  become relationships still enter relationships with
  status=pending_review — they require a SECOND review to become
  accepted relationships.
- **Agent types defined**: statute matcher, timeline anomaly, evidence
  extraction, authority mapping. Each with specific input/output contracts.
- **Agent permission matrix**: Agents are prolific proposers with zero
  write authority to canonical data. agent.review permission for
  human reviewers.
- **New tables**: agent_proposals, agent_runs (migration 012, not yet
  implemented).
- **Build sequence**: 3.1 Infrastructure, 3.2 Statute Matcher,
  3.3 Timeline Anomaly, 3.4 Evidence Extraction, 3.5 Authority Mapping.

## Phase 3.1: Agent Infrastructure Layer (2026-08-05)

- **Migration 012**: Four new tables — agent_definitions, agent_runs,
  agent_proposals, agent_feedback. Seeds four agent definition rows.
- **Agent module**: frontend/web/src/lib/agents/ with types.ts (247 lines),
  runner.ts (224 lines), proposals.ts (185 lines), registry.ts, index.ts.
- **Agent runner**: Builds read-only input snapshot from case graph,
  computes SHA256 hash for reproducibility, executes agent, persists
  proposals to agent_proposals with status='pending'. Never writes to
  canonical tables.
- **Proposal manager**: Lists proposals by case/status/agent. Reviews
  proposals (accept/reject). On accept: relationship_proposals are
  promoted to relationships with status='pending_review' (DOUBLE REVIEW).
  Records reviewer feedback in agent_feedback (evaluation dataset).
- **Three new API routes**: POST /api/v1/cases/{id}/agents/run,
  GET /api/v1/cases/{id}/agents/proposals, PATCH
  /api/v1/agents/proposals/{id}/review. All org-scoped, all auth+authz.
- **New permissions**: agent.read (all human roles), agent.run
  (admin, investigator, attorney), agent.review (admin, attorney,
  reviewer). Agents cannot run or review agents.
- **Agent registry**: Stub. No agents registered yet. Phase 3.2+
  will register timeline_anomaly, statute_matcher, evidence_extractor,
  authority_mapper.
- **Investigation Focus updated**: buildInvestigationFocus now includes
  accepted agent observations, procedural checks, and missing info.
  Also returns pending_agent_proposals count for the review queue badge.
- **Detail Panel**: New "Agent Proposals" tab with pending proposals
  review queue (Accept/Reject buttons) and reviewed proposals history.
  Badge shows pending count.
- **Evaluation contract**: docs/phase-3-evaluation-contract.md (369 lines).
  Defines test suites for each agent type. Required outputs, forbidden
  outputs. Agents that fail any test case cannot deploy to production.
  Forbidden: "violation occurred", confidence=1.0, legal conclusions.
- **Total**: 35 API routes, 12 migrations.

## Phase 3.2: Timeline Anomaly Agent (2026-08-05)

- **Output validators added**: Two validators run BEFORE proposals are
  persisted. Capability validator checks the proposal type is in the
  agent's allowed_outputs. Neutrality validator scans all text fields
  for forbidden phrases (violation, illegal, unlawful, etc.) and
  enforces confidence ceiling (max 0.95). Rejected proposals are logged
  to audit log and not persisted.
- **Machine-enforced capabilities**: Each agent type has a
  DEFAULT_CAPABILITIES config with allowed_outputs, forbidden_outputs,
  and forbidden_phrases. The runtime enforces these — the agent does
  not enforce its own rules.
- **Timeline Anomaly Agent implemented**: Pure rules engine (no LLM).
  Seven detection rules: notice period check, hearing-before-service
  inversion, compliance deadline passed, missing notice service date,
  missing compliance deadline, timeline gaps (>90 days), permit
  expired without finalization.
- **Hybrid approach**: Rules engine detects temporal conditions
  deterministically. All language is neutral — "Timeline shows X days
  between notice and hearing" not "The county violated notice
  requirements."
- **Agent registered** in registry. Agent run route now functional
  for agent_type=timeline_anomaly.
- **Test suite**: 6 test cases, 24 assertions, all passing. Tests
  verify required outputs, forbidden outputs (no "violation",
  "illegal", etc.), and no false positives on compliant/empty cases.
- **Total**: 35 API routes, 12 migrations.

## Phase 3.3: Statute Matcher Agent + Proposal Lineage (2026-08-05)

- **Migration 013**: Added `created_from_proposal_id` column to
  relationships table. Backfills from JSON notes for existing rows.
  Completes the provenance chain: Agent Run → Proposal → Accepted
  Proposal → Relationship → Review. Every accepted edge can now
  answer "Why does this relationship exist?" with a queryable FK.
- **Migration 014**: Statute library — 14 seeded statutes covering
  notice, hearing, enforcement, nuisance, substandard, permit, and
  due process categories. Humboldt County codes + California state
  codes. Each statute has keywords for matching and optional
  notice_period_days.
- **Lineage API**: GET /api/v1/relationships/{id}/lineage returns the
  full provenance chain: relationship → proposal → agent_run →
  agent_definition. 36 API routes total.
- **Statute Matcher Agent**: Pure rules engine. Matches findings to
  statutes based on rule-to-category mapping, keyword overlap, and
  jurisdiction preference. Produces only relationship_proposal
  (mandated_by). Never produces observations, checks, or findings.
  Confidence capped at 0.9. Skips closed/resolved findings.
- **Validator refinement**: statute_matcher forbidden phrases
  refined to avoid false positives on statute names containing
  "violation" (e.g. "Notice of Violation Service Requirements").
  Forbidden phrases now target conclusions, not nouns.
- **Test suite**: 6 test cases, 22 assertions, all passing. Tests
  verify correct matching, neutral language, confidence ranges,
  deduplication, and no false positives on empty/ambiguous cases.
- **Total**: 36 API routes, 14 migrations.
