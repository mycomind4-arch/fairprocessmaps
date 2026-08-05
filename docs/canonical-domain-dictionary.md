# FairProcess Canonical Domain Dictionary — LOCKED
**Version:** 1.0 — August 5, 2026
**Status:** FROZEN. Changes require architecture review.

This document defines every entity in the FairProcess domain. All code, documentation, and UI must use these definitions consistently.

---

## Immutability Boundary

FairProcess enforces a strict hierarchy of epistemic certainty. AI agents may observe and find, but may not conclude or act. This boundary is architectural, not optional.

```
Evidence  →  what exists (documents, records, data)
    ↓
Event     →  what happened (recorded occurrence)
    ↓
Finding   →  what was observed (deviation detected, pattern identified)
    ↓
Assessment →  interpretation (contextual analysis, severity scoring)
    ↓
Action    →  response (certified mail, filing, notification)
```

**Rules:**
- AI agents may create Evidence, Events, and Findings.
- AI agents may NOT create Assessments or Actions without human review.
- Findings use evidentiary language. They identify status. They do not render legal conclusions.
- The neutrality guardrail (`applyGuardrail()`) enforces this at the code level.

---

## Core Entities

### Case
The center of gravity for all related data. A legal or investigative proceeding involving one or more properties, scoped to an organization. Every entity in the system is ultimately traceable to a Case.
- **Owner table:** `cases` (migration 004) / `projects` (existing — to be consolidated)
- **Key:** `id` (UUID)
- **Scope:** Organization
- **Note:** `projects` is the legacy name. `case_id` in the event store currently maps to `project_id`.

### Property
A parcel or physical asset under investigation. Identified by APN (Assessor's Parcel Number). Can belong to multiple cases over time. Has geographic boundary (GeoJSON), centroid, zoning, and jurisdiction.
- **Owner table:** `properties`
- **Key:** `id` (UUID)
- **External key:** `apn` (parcel_id)

### Evidence
Any document, image, record, or data point that supports or contradicts a finding. Has a source (upload, AI research, building_dept, code_enforcement), status (raw → processed → flagged → archived), and extracted content.
- **Owner table:** `evidence`
- **Key:** `id` (UUID)
- **Provenance:** `source`, `source_url`, `source_portal`, `source_record_id`

### Finding
An AI- or user-generated observation derived from evidence using statute matching. Uses evidentiary language — never legal conclusions. Has severity (critical, warning, info) and status (open, resolved, dismissed).
- **Owner table:** `due_process_findings`
- **Key:** `id` (UUID)
- **Fingerprint:** `{case_id}:{rule}:{evidence_id}:{detail[:200]}`
- **Guardrail:** "You identify evidentiary status. You do not render legal conclusions."

### Event
A recorded occurrence affecting a case or artifact. Append-only. The single source of truth for "what happened." All projections (Timeline, Audit Log, Notifications) are filtered views on this table.
- **Owner table:** `events` (migration 005)
- **Key:** `id` (UUID)
- **Temporal provenance:**
  - `event_date` — when the action actually occurred (may be in the past)
  - `created_at` — when the database row was inserted (auto)
- **Immutability:** INSERT only. Never UPDATE or DELETE.

### Relationship
A typed, directed connection between two entities. Defines the graph structure. Idempotent (unique per source + target + type). Used for Authority Chain traversal, cross-entity navigation, and knowledge graph queries.
- **Owner table:** `relationships` (migration 005)
- **Key:** `id` (UUID)
- **Unique constraint:** `(source_type, source_id, target_type, target_id, relationship_type)`

---

## Projections (not tables — filtered views on Event Store)

### Timeline
A chronological projection of events for a case, filtered by `is_timeline_visible = 1`. Sorted by `event_date` (action date), falling back to `created_at`.
- **Source:** `SELECT FROM events LEFT JOIN event_types WHERE is_timeline_visible = 1`
- **Not a table.** Do not create a Timeline table. The existing `timeline_events` table is legacy and being deprecated.

### Audit Log
A filtered projection of events that are audit-worthy (`is_audit_worthy = 1`), ordered by `created_at`. Append-only by nature.
- **Source:** `SELECT FROM events LEFT JOIN event_types WHERE is_audit_worthy = 1`

### Notification
A filtered projection of events that are notification-worthy (`is_notification_worthy = 1`), scoped to a user's cases and a time threshold.
- **Source:** `SELECT FROM events LEFT JOIN event_types WHERE is_notification_worthy = 1 AND case_id IN (user's cases) AND created_at > last_seen`

---

## Domain Entities

### Code Enforcement Case
A specific enforcement action against a property. Has violation type, notice (served date, method, period), compliance deadline, hearing (date, type), abatement (date, cost), appeal (filed, date), and outcome.
- **Owner table:** `code_enforcement_cases`

### Building Permit
A permit record for construction activity. Has permit number, type, status (pending → issued → inspections → finalized/expired), valuation, dates (issued, expired, finalized), and inspection records.
- **Owner table:** `building_permits`

### Property Intelligence
Aggregated property data from 12 recon agents (zoning, general plan, coastal zone, flood zone, fire hazard, tsunami, etc.). Written by the recon system. One record per property.
- **Owner table:** `property_intelligence` (migration 003)

---

## Authority Chain Entities (Future — Not Yet Implemented)

### Official
A public employee or office holder who takes actions on a case (issues notices, conducts hearings, signs permits). Has name, title, and department membership.
- **Owner table:** (future — `officials`)
- **Relationships:** `member_of → Department`, `issued_by ← Evidence/CE Case`

### Department
An organizational unit that holds delegated authority (e.g., Code Enforcement Division, Building Department). Has name, jurisdiction, and delegated authority.
- **Owner table:** (future — `departments`)
- **Relationships:** `delegated_by → Authority`, `member_of ← Official`

### Authority
The legal or organizational source of governmental power. Delegated to departments. Established by statutes.
- **Owner table:** (future — `authorities`)
- **Relationships:** `authorized_by → Statute`, `delegated_by ← Department`

### Statute
A legal reference (statute, code section, case law) that defines procedural requirements, deadlines, and authority. Currently stored as static TypeScript data.
- **Owner:** `statutes.ts` (deadline rules) / `legal-data.ts` (curated references)
- **Relationships:** `authorized_by ← Authority`, `mandated_by ← Finding`

---

## Identity Layer (Migration 004)

### Organization
A multi-tenant entity (law firm, county, HOA) that owns cases and has members, roles, and feature access.
- **Owner table:** `organizations`

### User
An authenticated person with Supabase Auth credentials. Member of one or more organizations with a role.
- **Owner:** Supabase Auth

### Role
A named set of permissions within an organization (admin, investigator, viewer, attorney, etc.).
- **Owner table:** `roles`

### Permission
A specific capability (e.g., `evidence.upload`, `case.create`) granted to roles.
- **Owner table:** `permissions`

### Feature
A platform capability that can be toggled per organization (e.g., GIS, Code Enforcement, AI Agents).
- **Owner table:** `features`

---

## AI System Entities

### Recon Agent
One of 12 parallel data-gathering functions that query external data sources (ArcGIS, county portals) and write to D1. Fault-tolerant (Promise.allSettled).
- **Owner:** `recon-agents.ts` (code, not a table)

### Analysis Agent
One of several deterministic, rule-based functions that extract facts, build timelines, match statutes, and characterize discrepancies. Applies neutrality guardrails and SHA-256 audit hashing.
- **Owner:** `analysis-agents.ts` (code, not a table)

### Guardrail
A neutrality filter that replaces legal conclusions with evidentiary language in all AI outputs. Enforced at the code level by `applyGuardrail()`.
- **Owner:** `analysis-agents.ts`

---

## Event Type Catalog (Migration 005 — Seeded)

| Code | Category | Timeline | Notification | Audit | Default Severity |
|------|----------|----------|-------------|-------|-----------------|
| evidence.uploaded | evidence | ✓ | ✓ | ✓ | info |
| evidence.processed | evidence | ✓ | ✗ | ✓ | info |
| evidence.flagged | evidence | ✓ | ✓ | ✓ | warning |
| finding.created | finding | ✓ | ✓ | ✓ | warning |
| finding.resolved | finding | ✓ | ✗ | ✓ | info |
| ce.case_created | code_enforcement | ✓ | ✓ | ✓ | info |
| ce.notice_served | code_enforcement | ✓ | ✓ | ✓ | warning |
| ce.hearing_scheduled | code_enforcement | ✓ | ✓ | ✓ | info |
| ce.compliance_deadline | code_enforcement | ✓ | ✓ | ✓ | warning |
| ce.abatement | code_enforcement | ✓ | ✓ | ✓ | critical |
| ce.appeal_filed | code_enforcement | ✓ | ✓ | ✓ | info |
| ce.closed | code_enforcement | ✓ | ✗ | ✓ | info |
| permit.created | permit | ✓ | ✗ | ✓ | info |
| permit.issued | permit | ✓ | ✓ | ✓ | info |
| permit.inspection | permit | ✓ | ✗ | ✓ | info |
| permit.finalized | permit | ✓ | ✗ | ✓ | info |
| permit.expired | permit | ✓ | ✓ | ✓ | warning |
| recon.started | recon | ✗ | ✗ | ✓ | info |
| recon.completed | recon | ✓ | ✓ | ✓ | info |
| analysis.started | analysis | ✗ | ✗ | ✓ | info |
| analysis.completed | analysis | ✓ | ✓ | ✓ | info |
| case.created | case | ✓ | ✓ | ✓ | info |
| case.updated | case | ✗ | ✗ | ✓ | info |
| case.closed | case | ✓ | ✓ | ✓ | info |
| relationship.created | relationship | ✗ | ✗ | ✓ | info |

---

## Relationship Type Catalog (Migration 005 — Seeded)

| Code | Label | Source Type | Target Type | Description |
|------|-------|-----------|------------|-------------|
| supported_by | Supported By | finding | evidence | Finding is supported by this evidence |
| mandated_by | Mandated By | finding | statute | Finding is mandated by this statute |
| generated_from | Generated From | event | evidence | Event was generated from this source |
| issued_by | Issued By | ce_case | official | Action was issued by this official |
| member_of | Member Of | official | department | Official is a member of this department |
| delegated_by | Delegated By | department | authority | Department derives authority from this authority |
| authorized_by | Authorized By | authority | statute | Authority is established by this statute |
| references | References | any | any | Entity references another entity |
| relates_to | Relates To | any | any | Generic relationship |
| triggered_by | Triggered By | event | any | Event was triggered by this entity |

---

## Locked Contracts

The following are frozen and may not change without architecture review:

1. **Event immutability:** Events are INSERT-only. Never UPDATE or DELETE.
2. **Relationship idempotency:** `(source_type, source_id, target_type, target_id, relationship_type)` is unique. Re-creation is a no-op.
3. **Finding fingerprint:** `{case_id}:{rule}:{evidence_id}:{detail[:200]}` — used to detect new vs. existing findings.
4. **Neutrality guardrail:** Findings use evidentiary language. The guardrail rewrites legal conclusions.
5. **Temporal provenance:** `event_date` (action date) ≠ `created_at` (recording date). Timeline sorts by `event_date`.
6. **Event store is canonical:** Timeline, Audit Log, and Notifications are projections. `timeline_events` is legacy.
7. **Immutability boundary:** Evidence → Event → Finding → Assessment → Action. AI stops at Finding.

---

*Locked August 5, 2026. Foundation Phase 1A complete.*
