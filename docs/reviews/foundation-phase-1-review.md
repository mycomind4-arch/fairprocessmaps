# FairProcess Foundation Phase 1 — Architecture Review
**Date:** August 5, 2026
**Scope:** Migration 005 (Event Store & Relationship Engine), event-store.ts, /api/v1/events route, and event emission wiring across 5 existing API routes
**Reviewer:** Senior Platform Architect mode (no code changes — analysis only)

---

## 1. Architecture Diagrams

### 1.1 System Architecture (Post-Foundation Phase 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FAIRPROCESS PLATFORM                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    EVENT STORE (append-only)                  │  │
│  │                                                                │  │
│  │  Every change anywhere → events table → single stream         │  │
│  │  25 seeded event types with timeline/audit/notification flags  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                 │
│          ▼                   ▼                   ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐         │
│  │  TIMELINE    │  │  AUDIT LOG   │  │  NOTIFICATIONS   │         │
│  │  (projection)│  │  (projection)│  │  (projection)    │         │
│  │              │  │              │  │                  │         │
│  │ filter:      │  │ filter:      │  │ filter:          │         │
│  │ is_timeline  │  │ is_audit     │  │ is_notification  │         │
│  │ _visible=1  │  │ _worthy=1    │  │ _worthy=1        │         │
│  └──────────────┘  └──────────────┘  └──────────────────┘         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  RELATIONSHIP GRAPH                           │  │
│  │                                                                │  │
│  │  finding ──supported_by──> evidence                             │  │
│  │  finding ──mandated_by──> statute                                │  │
│  │  evidence ──issued_by──> official                               │  │
│  │  official ──member_of──> department                             │  │
│  │  department ──delegated_by──> authority                         │  │
│  │  authority ──authorized_by──> statute                           │  │
│  │                                                                │  │
│  │  10 seeded relationship types, all typed and directed           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                IDENTITY LAYER (migration 004)                 │  │
│  │  Organizations → Members → Roles → Permissions → Features      │  │
│  │  Audit Logs → System Events → AI Agents → API Keys             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                EXISTING DOMAIN (schema.sql + migrations)      │  │
│  │  Projects → Properties → Evidence → Timeline Events            │  │
│  │  → Due Process Findings → Building Permits                     │  │
│  │  → Code Enforcement Cases → Property Intelligence              │  │
│  │  → Recorder Records                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Event Emission Flow

```
User Action or AI Agent
        │
        ▼
  Existing API Route (e.g., evidence/upload)
        │
        ├── 1. Execute main operation (INSERT into evidence table) ──► SUCCESS
        │
        ├── 2. Create legacy timeline_event row (backward compat) ──► SUCCESS
        │
        └── 3. emitEvent(db, {event_type: 'evidence.uploaded', ...})
                   │
                   ├── Try: INSERT INTO events (...)
                   │
                   ├── Success → return event ID
                   │
                   └── Failure → console.error, return null
                                 (main operation unaffected)
```

### 1.3 Authority Chain Traversal

```
Finding
  │
  ├── supported_by ──► Evidence[1] ──► issued_by ──► Official[1]
  │                                      │
  │                                      └── member_of ──► Department[1]
  │                                                            │
  │                                                            └── delegated_by ──► Authority[1]
  │                                                                                    │
  │                                                                                    └── authorized_by ──► Statute[1]
  │
  ├── supported_by ──► Evidence[2] (no official linked)
  │
  └── mandated_by ──► Statute[2] (direct statute match)
```

---

## 2. Entity Relationship Diagram (Full System)

```
┌───────────┐     ┌──────────────┐     ┌──────────┐
│Organization│───<│Org Members   │>───│User       │
└─────┬─────┘     └──────────────┘     └──────────┘
      │
      ▼
┌───────────┐     ┌──────────────┐     ┌──────────┐
│ Cases      │───<│Case Projects │>───│ Projects │
│ (m004)     │     │(junction)    │     │(existing)│
└─────┬─────┘     └──────────────┘     └────┬─────┘
      │                                       │
      │           ┌───────────────────────────┘
      │           │
      ▼           ▼
┌───────────┐                          ┌──────────┐
│ Properties │─────────────────────────│ Evidence  │
│(existing)  │                          │(existing) │
└─────┬─────┘                          └────┬─────┘
      │                                     │
      ▼                                     ▼
┌──────────────┐     ┌──────────────┐  ┌──────────────┐
│Property      │     │Timeline Events│  │Due Process   │
│Intelligence  │     │(existing)      │  │Findings      │
│(existing)    │     └──────────────┘  │(existing)    │
└──────────────┘                       └──────┬───────┘
                                              │
┌──────────────┐     ┌──────────────┐        │
│Building      │     │Code Enforce-  │        │
│Permits       │     │ment Cases     │        │
│(existing)    │     │(existing)     │        │
└──────────────┘     └──────────────┘        │
                                              │
┌─────────────────────────────────────────────┘
│
├── NEW (migration 005) ──────────────────────────
│
▼
┌──────────────────────────────────────────────────────────┐
│ EVENTS (append-only)                                      │
│ id, case_id, event_type, entity_type, entity_id,         │
│ actor_type, actor_id, severity, title, description,      │
│ payload (JSON), created_at                                │
│                                                           │
│ Indexed by: case_id, event_type, entity_type+entity_id,  │
│             actor_type+actor_id, created_at, severity     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ RELATIONSHIPS (typed graph)                               │
│ id, case_id, source_type, source_id, target_type,         │
│ target_id, relationship_type, metadata (JSON),           │
│ created_at                                                 │
│                                                           │
│ Unique constraint: (source_type, source_id, target_type,  │
│                     target_id, relationship_type)           │
│ Indexed by: case_id, source, target, relationship_type    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐
│ EVENT_TYPES (catalog)     │  │ RELATIONSHIP_TYPES      │
│ code (PK), category,     │  │ code (PK), label,        │
│ label, is_timeline_visible│  │ description, source_type,│
│ is_notification_worthy,  │  │ target_type, is_directed │
│ is_audit_worthy,         │  └──────────────────────────┘
│ default_severity          │
│ 25 rows seeded            │
└──────────────────────────┘
```

---

## 3. Event Flow Diagrams

### 3.1 Evidence Upload Flow
```
POST /api/v1/evidence/upload
  │
  ├── formData → R2 upload
  ├── INSERT INTO evidence (id, project_id, ...)
  ├── INSERT INTO timeline_events (legacy, backward compat)
  ├── emitEvent('evidence.uploaded', entity=evidence, actor=user)
  └── runAnalysis(projectId)
       ├── (legacy) analyzeProject() → INSERT/UPDATE due_process_findings
       └── (agents) runAnalysisAgents() → comprehensive analysis
```

### 3.2 Code Enforcement Create Flow
```
POST /api/v1/enforcement
  │
  ├── INSERT INTO code_enforcement_cases
  ├── emitEvent('ce.case_created', entity=ce_case, actor=user)
  ├── if notice_served_date → emitEvent('ce.notice_served', severity=warning)
  ├── if hearing_date → emitEvent('ce.hearing_scheduled')
  └── if compliance_deadline → emitEvent('ce.compliance_deadline', severity=warning)
```

### 3.3 Analysis Run Flow
```
POST /api/v1/findings (trigger analysis)
  │
  ├── emitEvent('analysis.started', actor=ai_agent)
  ├── runAnalysisAgents() → fact extraction, timeline building, statute matching
  ├── runAnalysis() → legacy rule-based findings
  ├── emitEvent('analysis.completed', title=findings summary)
  ├── For each open finding:
  │   ├── createRelationship(finding → supported_by → evidence)
  │   ├── createRelationship(finding → mandated_by → statute)
  │   └── emitEvent('finding.created', severity=severity)
  └── Return results
```

### 3.4 Timeline Read Flow (merged)
```
GET /api/v1/timeline?projectId=xxx
  │
  ├── Query 1: SELECT FROM timeline_events LEFT JOIN evidence
  │   (legacy events with evidence_title)
  │
  ├── Query 2: getCaseTimeline() — SELECT FROM events
  │   LEFT JOIN event_types WHERE is_timeline_visible=1
  │   → eventToTimelineDisplay() mapping
  │
  └── Merge: [...legacyItems, ...eventStoreItems] sorted by date DESC
```

---

## 4. Relationship Traversal Examples

### 4.1 "Show me the evidence behind this finding"
```
Finding: "No prior notice found before hearing on 2024-03-15"

Query: getRelationshipsFrom(db, 'finding', findingId, 'supported_by')
Result: [
  { source_id: findingId, target_type: 'evidence', target_id: 'ev-001', relationship_type: 'supported_by' },
  { source_id: findingId, target_type: 'evidence', target_id: 'ev-002', relationship_type: 'supported_by' }
]
```

### 4.2 "What statute mandates this finding?"
```
Finding: "Only 5 days between notice and hearing (minimum: 10)"

Query: getRelationshipsFrom(db, 'finding', findingId, 'mandated_by')
Result: [
  { source_id: findingId, target_type: 'statute', target_id: 'HCC § 351-12', relationship_type: 'mandated_by' }
]
```

### 4.3 "Trace the full authority chain"
```
Query: getAuthorityChain(db, findingId)

Result:
{
  evidence: [{ target_id: 'ev-001', relationship_type: 'supported_by' }],
  officials: [{ target_id: 'off-001', relationship_type: 'issued_by' }],
  departments: [{ target_id: 'dept-ce', relationship_type: 'member_of' }],
  authorities: [{ target_id: 'auth-hcc311', relationship_type: 'delegated_by' }],
  statutes: [
    { target_id: 'HCC § 311-3', relationship_type: 'authorized_by' },
    { target_id: 'HCC § 351-12', relationship_type: 'mandated_by' }
  ]
}
```

### 4.4 "What events affected this case?"
```
Query: getCaseTimeline(db, caseId)

Result (filtered by is_timeline_visible=1):
[
  { event_type: 'evidence.uploaded', title: 'Evidence uploaded: notice.pdf', created_at: '...' },
  { event_type: 'ce.notice_served', title: 'Notice served: Nuisance violation', severity: 'warning' },
  { event_type: 'ce.hearing_scheduled', title: 'Hearing scheduled for 2024-03-15' },
  { event_type: 'finding.created', title: 'Adequate Notice Period: Only 5 days...', severity: 'critical' },
  { event_type: 'recon.completed', title: 'Recon complete: 12/12 agents' },
]
```

---

## 5. Issues Found

### BUG 1: Event Duplication on Relationship Re-creation (Medium)
**Location:** `event-store.ts` → `createRelationship()`

The function uses `INSERT OR IGNORE` for idempotency (good), but then **always** emits a `relationship.created` event regardless of whether the insert actually happened. Every time analysis re-runs and re-creates the same relationships, duplicate `relationship.created` events accumulate in the event store.

**Impact:** Event store bloat; timeline shows duplicate `relationship.created` entries (though these are filtered out by `is_timeline_visible=0`).

**Fix needed:** Check D1's `meta.changes` after `INSERT OR IGNORE`. Only emit the event if a row was actually inserted.

### BUG 2: Finding Events Emitted for ALL Open Findings, Not Just New Ones (High)
**Location:** `findings/route.ts` → POST handler

After analysis runs, the code queries ALL open findings and emits `finding.created` for each one. If analysis is re-run, it re-emits events for findings that were already created in a previous run. Same for relationship creation.

**Impact:** Event store accumulates duplicate `finding.created` events every time analysis is triggered. The timeline will show duplicate finding entries.

**Fix needed:** Track which findings existed before analysis (query before), then only emit events for findings whose IDs weren't in the pre-existing set.

### BUG 3: Timeline Duplication — No Deduplication Implemented (High)
**Location:** `timeline/route.ts` → GET handler

Evidence upload creates BOTH a `timeline_events` row (legacy code) AND an `evidence.uploaded` event (new code). Both appear in the merged timeline. The code comment says "deduplicate by type+description" but the actual implementation is a naive concatenation + sort with zero deduplication logic.

**Impact:** Users see duplicate entries in the timeline — e.g., "Evidence uploaded: notice.pdf" appears twice (once from each source).

**Fix needed:** Either (a) implement deduplication in the merge step (match on event_type + description), or (b) stop creating legacy `timeline_events` rows for operations that now emit events, or (c) use a "source" flag to identify the canonical version.

### BUG 4: Event Date vs Created At Mismatch (Medium)
**Location:** `timeline/route.ts` → GET handler → `eventToTimelineDisplay()`

Event store events use `created_at` (when the event was recorded) as the `event_date` in the merged timeline. But some events reference actions that happened on a different date (e.g., a CE notice served on March 1st, recorded on August 5th). The timeline sorts by `created_at`, so the event appears on August 5th, not March 1st.

**Impact:** Timeline events from the event store appear in wrong chronological position relative to legacy `timeline_events` which use the actual action date.

**Fix needed:** Store an `event_date` in the event payload or add an `event_date` column to the events table. Sort the merged timeline by `event_date`, not `created_at`.

### ISSUE 5: `case_id` vs `project_id` Naming Inconsistency (Low — Design Decision)
**Location:** `events` table, `event-store.ts`

The events table uses `case_id` (forward-looking, anticipating the Case entity from migration 004). But all existing code passes `projectId` as `case_id`. This is a deliberate naming decision but creates confusion: developers reading the code see `case_id: projectId` and may not understand why.

**Impact:** Developer confusion. Not a runtime bug.

**Recommendation:** Add a comment in the migration documenting that `case_id` currently maps to `project_id` and will be properly aliased when cases are wired.

### ISSUE 6: Unused Import (Trivial)
**Location:** `event-store.ts` line 1

`import { getCloudflareContext } from "@opennextjs/cloudflare"` is imported but never used. The D1 database is always passed as a parameter.

### ISSUE 7: N+1 Queries in `getAuthorityChain` (Medium — Performance)
**Location:** `event-store.ts` → `getAuthorityChain()`

The function iterates over each evidence item, each official, each department, each authority — making one query per item. For a case with 20 findings and 20 evidence items, this could be 60+ sequential queries.

**Impact:** Latency on the authority chain API. Acceptable for small cases; problematic for large investigations.

**Fix needed:** Replace with a single recursive CTE or a UNION ALL query that traverses the graph in one shot.

---

## 6. Backward Compatibility Assessment

| Change | Backward Compatible? | Risk |
|--------|---------------------|------|
| Migration 005 (new tables) | ✅ Yes — purely additive | None — no existing tables modified |
| event-store.ts (new file) | ✅ Yes — new module, nothing imports it except new code | None |
| /api/v1/events (new route) | ✅ Yes — new endpoint, no existing routes changed | None |
| evidence/upload/route.ts | ✅ Yes — added emitEvent after existing logic | If event store table doesn't exist, emitEvent fails silently |
| enforcement/route.ts | ✅ Yes — added emitEvent + pre-read for change detection | Pre-read adds 1 query to PATCH; if event store doesn't exist, events fail silently |
| permits/route.ts | ✅ Yes — same pattern as enforcement | Same |
| findings/route.ts | ✅ Yes — added emitEvent + relationship creation | If event store doesn't exist, both fail silently. Finding creation still works. |
| timeline/route.ts GET | ⚠️ Partially — merges two sources | **BUG 3: no deduplication.** Timeline may show duplicate entries. Existing timeline_events still work; event store query wrapped in try/catch. |
| timeline/route.ts POST | ✅ Yes — added emitEvent after existing INSERT | New event is in addition to legacy timeline_event row |

**Verdict:** Backward compatible with one visible issue (timeline duplication). All event emission is wrapped in try/catch and fails silently if the migration hasn't been applied. The app continues to work without the event store — it just doesn't record events.

---

## 7. Performance Considerations

### 7.1 Write Path
Every modified API route adds 1-N event INSERTs after the main operation. Each `emitEvent` is a single INSERT with 12 bind parameters. This adds ~2-5ms per event. The enforcement PATCH route adds a pre-read query (~2ms). Total overhead per request: 5-15ms depending on how many events are emitted. **Acceptable.**

### 7.2 Read Path
- **Timeline GET:** 2 sequential queries (legacy + event store with JOIN to event_types). Each is indexed. Merge happens in JS. For 200 events, merge + sort is <1ms. **Acceptable.**
- **Authority chain:** N+1 queries. For 5 findings × 3 evidence × 1 official = ~15 queries. ~30ms total. **Marginal — needs optimization for larger cases.**
- **Events API:** Single indexed query with filters. **Good.**

### 7.3 Storage Growth
Each event row is ~200-400 bytes (with payload). At 100 events/case and 100 cases, that's ~40KB. At 10,000 cases with 500 events each, that's ~2GB. D1's 10GB limit is reached at ~50,000 cases with heavy event emission. **Needs an archival strategy for production scale.**

### 7.4 Index Strategy
The events table has 6 indexes. The relationships table has 4 indexes + 1 unique constraint. This is comprehensive but adds write overhead (~30% on INSERTs). **Acceptable for current scale.**

---

## 8. Scaling Considerations

### 8.1 D1 Limits
- 10GB database size → ~50,000 cases with heavy event emission before hitting limit
- 1000 reads/sec → adequate for single-tenant; may need read replicas for multi-tenant
- No built-in partitioning → events table will need manual archival (e.g., move events older than 1 year to an `events_archive` table)

### 8.2 Graph Depth
The relationship graph is currently traversed with N+1 sequential queries. As the graph grows deeper (evidence → officials → departments → authorities → statutes → cases → appeals), this becomes O(n^depth). **Needs a recursive CTE or pre-computed path table for depth > 3.**

### 8.3 Multi-Tenant Isolation
The `case_id` column in events and relationships provides case-level isolation. But there's no `organization_id` column. When orgs are wired in, queries will need to filter by org, requiring either:
- An org_id column on the events table (preferred)
- A JOIN through cases → organizations (slower)

---

## 9. Duplication Still Present

| Item | Status | Action |
|------|--------|--------|
| Due-process rules in 3 places (auto-triggers.ts, due_process_analyzer.py, analysis-agents.ts) | Not addressed by event store | Delete Python backend; consolidate rules in statutes.ts |
| Python backend (1,000+ LOC) | Not addressed | Delete or archive |
| Evidence upload creates both timeline_events row AND event store entry | **New duplication introduced** | Stop creating timeline_events for operations that emit events, or implement dedup in merge |
| `timeline_events` table and `events` table | Coexist with overlap | Eventually deprecate timeline_events; migrate to events-only |
| `legal-data.ts` and `statutes.ts` | Not addressed | Merge or cross-reference |
| AdminPanel (project-level, localStorage) and Admin Dashboard (org-level, migration 004) | Not addressed | Replace project AdminPanel with org-level admin |

---

## 10. Recommended Refinements Before UI Work

### R1. Fix Timeline Deduplication (Critical)
Either implement deduplication in the merge step or stop creating legacy `timeline_events` rows for operations that now emit events. The current state produces visible duplicates.

**Approach:** Add a `source_event_id` column to `timeline_events`. When emitting an event that also creates a timeline_event, store the event ID. In the merge, exclude timeline_events that have a `source_event_id` matching an event in the store.

### R2. Fix Finding Event Re-emission (Critical)
Only emit `finding.created` events for findings that didn't exist before the current analysis run. Query findings before and after, diff by ID, emit only for new IDs.

### R3. Fix Relationship Event Re-emission (High)
Check `meta.changes` from `INSERT OR IGNORE` to determine if a row was actually inserted. Only emit `relationship.created` when a new relationship was created.

### R4. Add `event_date` to Events Table (High)
Add an optional `event_date` column to the events table. When emitting events for historical actions (CE notice served on a past date), store the action date here. Sort the timeline by `event_date` (falling back to `created_at` when null).

### R5. Remove Unused Import (Trivial)
Remove `getCloudflareContext` import from `event-store.ts`.

### R6. Document `case_id` Mapping (Low)
Add a comment in migration 005 explaining that `case_id` currently maps to `project_id` and will be properly aliased when the Case entity is wired.

### R7. Plan Event Archival Strategy (Medium)
Design a periodic archival job that moves events older than N days to an `events_archive` table. This prevents unbounded growth.

### R8. Plan Org Isolation (Medium)
When organizations are wired, add `organization_id` to the events and relationships tables. This enables org-scoped queries without JOINs.

---

## 11. Evolution to Knowledge Graph

The current architecture can evolve into a full knowledge graph without a major rewrite. Here's how:

### Stage 1 (Current): Event Store + Flat Relationships
- Events capture what happened
- Relationships capture typed connections between entities
- Both are scoped to a case

### Stage 2: Entity Resolution
- Add an `entities` table that serves as a registry of all known entities (officials, departments, authorities, statutes) with canonical IDs
- When the same official appears in different evidence documents, resolve to the same entity
- Relationships point to canonical entity IDs

### Stage 3: Temporal Relationships
- Add `valid_from` and `valid_to` to relationships
- An official's department membership can change over time
- Authority chain queries can ask "what was the chain at time T?"

### Stage 4: Graph Query Engine
- Replace N+1 traversal with recursive CTEs or a pre-computed path table
- Support multi-hop queries: "show me all statutes that have been cited in findings for this department"
- Support bidirectional traversal: "show me all findings that reference this statute"

### Stage 5: Inference Layer
- The AI agents can create relationships beyond what's explicitly in the data
- e.g., "This finding is similar to findings in other cases" (case → similar_to → case)
- e.g., "This official's decisions show a pattern of skipping notice periods" (official → pattern → behavior)

**Key insight:** None of these stages require schema changes to the existing `events` or `relationships` tables. They add new tables and indexes alongside them. The current design is forward-compatible.

---

## 12. Canonical Domain Dictionary

| Entity | Definition | Owner Table | Migration |
|--------|-----------|------------|-----------|
| **Case** | A legal or investigative proceeding involving one or more properties, scoped to an organization. The center of gravity for all related data. | `cases` (m004) / `projects` (existing — to be consolidated) | 004, schema.sql |
| **Project** | Legacy name for a Case. Currently the primary entity. Will be absorbed by Case when orgs are wired. | `projects` | schema.sql |
| **Property** | A parcel or physical asset under investigation. Identified by APN. Can belong to multiple cases over time. | `properties` | schema.sql |
| **Evidence** | Any document, image, record, or data point that supports or contradicts a finding. Has a source, status, and extracted content. | `evidence` | schema.sql |
| **Finding** | An AI- or user-generated observation derived from evidence using statute matching. Uses evidentiary language (no legal conclusions). Has severity and status. | `due_process_findings` | schema.sql, 003 |
| **Event** | A recorded occurrence affecting a case or artifact. Append-only. The single source of truth for "what happened." Projections (timeline, audit, notifications) are filtered views. | `events` | 005 |
| **Relationship** | A typed, directed connection between two entities. Defines the graph structure. Idempotent (unique per source+target+type). | `relationships` | 005 |
| **Timeline Event** | A legacy entity for chronological display. Being superseded by Event Store projections. Maintained for backward compatibility. | `timeline_events` | schema.sql |
| **Timeline** | A chronological projection of events for a case. Not a table — it's a query view on the Event Store filtered by `is_timeline_visible=1`. | (projection on `events`) | 005 |
| **Audit Log** | A filtered projection of events that are audit-worthy (`is_audit_worthy=1`). Append-only by nature. | (projection on `events`) | 005 |
| **Notification** | A filtered projection of events that are notification-worthy (`is_notification_worthy=1`), scoped to a user's cases. | (projection on `events`) | 005 |
| **Authority** | The legal or organizational source of governmental power. Delegated to departments. Established by statutes. | (future table) | TBD |
| **Official** | A public employee or office holder who takes actions on a case (issues notices, conducts hearings, signs permits). | (future table) | TBD |
| **Department** | An organizational unit that holds delegated authority (e.g., Code Enforcement Division, Building Department). | (future table) | TBD |
| **Agency** | A governmental body with jurisdiction over properties (e.g., Humboldt County, City of Eureka). | (future table) | TBD |
| **Statute** | A legal reference (statute, code section, case law) that defines procedural requirements, deadlines, and authority. | `statutes.ts` (static) / `legal-data.ts` (static) | N/A (code) |
| **Code Enforcement Case** | A specific enforcement action against a property. Has violation type, notice, hearing, compliance deadline, and outcome. | `code_enforcement_cases` | schema.sql |
| **Building Permit** | A permit record for construction activity on a property. Has status, dates, inspections, and valuation. | `building_permits` | schema.sql |
| **Property Intelligence** | Aggregated property data from 12 recon agents (zoning, hazards, jurisdiction, etc.). Written by the recon system. | `property_intelligence` | 003 |
| **Recon Agent** | One of 12 parallel data-gathering functions that query external data sources (ArcGIS, county portals) and write to D1. | (code: `recon-agents.ts`) | 003 |
| **Analysis Agent** | One of several deterministic, rule-based functions that extract facts, build timelines, match statutes, and characterize discrepancies. | (code: `analysis-agents.ts`) | N/A (code) |
| **Organization** | A multi-tenant entity (law firm, county, HOA) that owns cases and has members, roles, and feature access. | `organizations` | 004 |
| **User** | An authenticated person with Supabase Auth credentials. Member of one or more organizations with a role. | (Supabase Auth) | N/A |
| **Role** | A named set of permissions within an organization (admin, investigator, viewer, attorney). | `roles` | 004 |
| **Permission** | A specific capability (e.g., `evidence.upload`, `case.create`) granted to roles. | `permissions` | 004 |
| **Feature** | A platform capability that can be toggled per organization (e.g., GIS, Code Enforcement, AI Agents). | `features` | 004 |
| **Guardrail** | A neutrality filter that replaces legal conclusions with evidentiary language in all AI outputs. | (code: `analysis-agents.ts`) | N/A (code) |
| **Event Type** | A catalog entry defining an event's category, visibility (timeline/audit/notification), and default severity. | `event_types` | 005 |
| **Relationship Type** | A catalog entry defining a typed connection (supported_by, mandated_by, issued_by, etc.) with source/target entity types. | `relationship_types` | 005 |

---

## 13. Overall Assessment

### What Works
- The Event Store + Relationship Engine is architecturally sound. The single-stream model where Timeline, Audit Log, and Notifications are all projections of the same event table is elegant and correct.
- Event emission is safe — all wrapped in try/catch, never breaks the main operation. The platform works with or without the event store.
- The migration is purely additive. Zero existing tables modified. Zero risk to existing data.
- The relationship graph with typed, directed connections is the right model for the Authority Chain.
- The forward-compatibility path to a knowledge graph (entity resolution, temporal relationships, graph queries) doesn't require schema rewrites.

### What Needs Fixing Before UI
- **3 bugs** (timeline deduplication, finding re-emission, relationship re-emission) must be fixed. These are data quality issues, not architectural flaws.
- **1 design improvement** (event_date column) needed for correct chronological ordering.
- **4 cleanups** (unused import, case_id documentation, archival strategy, org isolation planning) — non-blocking.

### Verdict
The architecture is correct. The implementation has bugs that need fixing before building UI on top of it. The model can evolve into a full knowledge graph without rewrites. **Foundation Phase 1 is sound — fix the 3 bugs, then proceed to Phase 2 (Relationship UI).**

---

*Review completed August 5, 2026. 3 files new, 5 files modified, 1 migration reviewed.*
