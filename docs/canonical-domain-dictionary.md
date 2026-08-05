# FairProcess Canonical Domain Dictionary — LOCKED
**Version:** 1.1 — August 5, 2026
**Status:** FROZEN. Changes require architecture review.

This document defines every entity in the FairProcess domain. All code, documentation, and UI must use these definitions consistently.

---

## Immutability Boundary

```
Evidence → Event → Observation → Finding → Assessment → Action
```

| Layer         | Who writes it     | Who reads it    | Mutable? |
|---------------|--------------------|-----------------|----------|
| Evidence      | Users, scrapers    | All             | ❌ No     |
| Event         | System, agents     | All             | ❌ No (append-only) |
| Observation   | AI agents           | All             | ❌ No     |
| Finding       | AI agents, users    | All             | ❌ No     |
| Assessment    | Users              | All             | ✅ Yes    |
| Action        | Users              | All             | ✅ Yes    |

**AI agents operate in the Observation and Finding layers only.** They cannot modify evidence, alter events, or declare legal conclusions.

---

## Domain Entities

### 1. Case
**Definition:** A legal or investigative proceeding involving one or more properties.
**Owner table:** `projects` (legacy, absorbing into `cases`)
**Key fields:** id, name, case_type, status, due_process_score, opened_at
**Relationships:** has Properties, has Evidence, has Findings, has Events, has Timeline, has Officials
**Notes:** The center of gravity. Everything is a view of the Case.

### 2. Project (legacy)
**Definition:** The legacy name for Case. Being absorbed into the Case concept.
**Owner table:** `projects`
**Notes:** All existing code uses `project_id`. Events table uses `case_id` which currently maps to `project_id`.

### 3. Property
**Definition:** A parcel or physical asset under investigation.
**Owner table:** `projects` (embedded) / future `properties` table
**Key fields:** apn, address, city, coordinates
**Relationships:** belongs to Case, has Permits, has CE Cases

### 4. Evidence
**Definition:** Any document, image, or record supporting or contradicting a finding.
**Owner table:** `evidence`
**Key fields:** id, project_id, title, source, doc_type, r2_key, status
**Statuses:** uploaded → processed → indexed → archived
**Immutability:** Evidence is immutable once created. No agent can modify or delete it.
**Relationships:** supports Findings, issued by Officials

### 5. Finding
**Definition:** An AI- or user-generated evidentiary observation derived from evidence. NOT a legal conclusion.
**Owner table:** `due_process_findings`
**Key fields:** id, project_id, rule, rule_name, severity, status, detail, evidence_id, finding_fingerprint, jurisdiction_id
**Statuses:** open → resolved → dismissed
**Fingerprint:** `{case_id}:{jurisdiction_id}:{rule}:{evidence_id}:{detail[:200]}`
**Immutability:** Findings are immutable once created. Status can change, but content cannot.
**Guardrail:** All AI-generated findings pass through the neutrality guardrail before storage.

### 6. Event
**Definition:** A recorded occurrence affecting a case or artifact. The single source of truth.
**Owner table:** `events` (append-only)
**Key fields:** id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, severity, event_date, effective_date, jurisdiction_id, source_system, source_record_id, payload, created_at
**Temporal model:**
  - `event_date` — when the action occurred (may be in the past for imported records)
  - `effective_date` — when the action takes effect (may differ from event_date)
  - `created_at` — when the database row was inserted
**Source identity:** `(source_system, source_record_id, event_type)` — one event per source record
**Immutability:** Events are append-only. No updates, no deletes. Ever.
**Projections:**
  - Timeline = filter by `timeline_visible = 1`, sort by `event_date`
  - Audit Log = filter by `audit_visible = 1`, sort by `created_at`
  - Notifications = filter by `notification_worthy = 1`, sort by `created_at`

### 7. Relationship
**Definition:** A typed, directed, temporal connection between two entities.
**Owner table:** `relationships`
**Key fields:** id, case_id, source_type, source_id, target_type, target_id, relationship_type, valid_from, valid_to, jurisdiction_id, metadata
**Temporal model:**
  - `valid_from` — when the relationship became true
  - `valid_to` — when it ended (NULL = currently active)
  - Active relationships: `valid_to IS NULL OR valid_to > now`
**Idempotency:** `(source_type, source_id, target_type, target_id, relationship_type)` is unique. Re-creating a relationship is a no-op.
**Immutability:** Relationships are temporal, not mutable. To change ownership, end the old relationship (set valid_to) and create a new one.

### 8. Timeline Event (legacy)
**Definition:** A chronological projection of events relevant to the case. Being replaced by the Event Store.
**Owner table:** `timeline_events` (legacy, deprecating)
**Migration:** New operations emit to the Event Store only. Timeline GET merges both sources with deduplication.
**Deprecation:** Stop creating new `timeline_events` rows. The table remains for historical data.

### 9. Authority
**Definition:** The legal or organizational source of governmental power. Established by statutes, delegated to departments.
**Owner table:** future `authorities` table
**Relationships:** delegates to Departments, mandated by Statutes

### 10. Official
**Definition:** A public employee or office holder participating in the process.
**Owner table:** future `officials` table
**Relationships:** member of Department, issued Evidence

### 11. Department
**Definition:** A government department exercising delegated authority.
**Owner table:** future `departments` table
**Relationships:** member_of Authority, employs Officials

### 12. Agency
**Definition:** Synonym for Department in some jurisdictions. Not a separate entity.

### 13. Statute
**Definition:** A legal provision that establishes a requirement or authority.
**Owner table:** `statutes` (in `legal-data.ts` / future database)
**Key fields:** citation, title, jurisdiction, deadline_days, category
**Relationships:** mandated by Authority, violated by Findings

### 14. Timeline
**Definition:** A chronological projection of the Event Store. NOT a separate data source.
**Implementation:** `getCaseTimeline()` — filters events by `timeline_visible = 1`, sorts by `event_date DESC`.

### 15. Audit Log
**Definition:** A chronological projection of the Event Store for administrative purposes.
**Implementation:** `getCaseAuditLog()` — filters events by `audit_visible = 1`, sorts by `created_at DESC`.

### 16. Notification
**Definition:** A projection of the Event Store for user-facing alerts.
**Implementation:** `getNotifications()` — filters events by `notification_worthy = 1`.

### 17. Organization
**Definition:** A multi-tenant entity (law firm, HOA, government agency) that owns Cases.
**Owner table:** `organizations` (migration 004)
**Key fields:** id, name, slug, plan_tier, max_users
**Relationships:** has Users, has Cases, has Feature Gates

### 18. User
**Definition:** An authenticated person with access to FairProcess.
**Owner table:** Supabase Auth users + `organization_members` (migration 004)
**Key fields:** id, email, full_name, role
**Relationships:** member of Organization, has Role

### 19. Role
**Definition:** A named set of permissions within an organization.
**Owner table:** `roles` (migration 004)
**Key fields:** id, org_id, name, description
**Relationships:** has Permissions, assigned to Users

### 20. Permission
**Definition:** A granular capability granted to a role.
**Owner table:** `permissions` (migration 004)
**Key fields:** id, code, description, category
**Notes:** Central permission registry, not hardcoded.

### 21. Feature
**Definition:** A platform capability gated by organization plan tier.
**Owner table:** `feature_registry` (migration 004)
**Key fields:** id, code, name, description, min_plan_tier
**Notes:** Central capability registry. No scattered if-statements.

### 22. Code Enforcement Case
**Definition:** A government enforcement action against a property.
**Owner table:** `code_enforcement_cases`
**Key fields:** id, project_id, case_number, status, notice_served_date, hearing_date, abatement_date, appeal_filed_date
**Events emitted:** ce.case_created, ce.notice_served, ce.hearing_scheduled, ce.compliance_deadline, ce.abatement, ce.appeal_filed, ce.closed

### 23. Building Permit
**Definition:** A government-issued permit for construction or modification.
**Owner table:** `building_permits`
**Key fields:** id, project_id, permit_number, permit_type, permit_status, issued_date, finalized_date, expired_date
**Events emitted:** permit.created, permit.issued, permit.inspection, permit.finalized, permit.expired

### 24. Property Intelligence
**Definition:** AI-gathered intelligence about a property from public records.
**Owner table:** evidence (stored as evidence with source = recon)
**Events emitted:** recon.started, recon.completed

### 25. Recon Agent
**Definition:** An AI agent that gathers property intelligence from public data sources.
**Owner table:** N/A (ephemeral, results stored as Evidence)
**Permissions:** Can create observations, attach evidence, create events. Cannot modify evidence or declare legal conclusions.

### 26. Analysis Agent
**Definition:** An AI agent that analyzes evidence for due-process discrepancies.
**Owner table:** N/A (ephemeral, results stored as Findings)
**Permissions:** Can create observations, propose relationships, create events. Cannot modify evidence or declare legal conclusions.

### 27. Audit Log Entry (legacy)
**Definition:** Being replaced by the Event Store audit projection.
**Owner table:** `audit_logs` (migration 004)
**Migration:** The `audit_logs` table becomes a view/projection of the Event Store.

---

## Event Type Catalog (25 types)

| Code                       | Display Label              | Timeline | Audit | Notify |
|---------------------------|---------------------------|----------|-------|--------|
| evidence.uploaded          | Evidence Uploaded          | ✅       | ✅    | ✅     |
| evidence.processed         | Evidence Processed         | ✅       | ✅    |        |
| evidence.flagged           | Evidence Flagged           | ✅       | ✅    | ✅     |
| finding.created            | Finding Created            | ✅       | ✅    | ✅     |
| finding.resolved           | Finding Resolved           | ✅       | ✅    |        |
| ce.case_created            | CE Case Created            | ✅       | ✅    |        |
| ce.notice_served           | Notice Served              | ✅       | ✅    | ✅     |
| ce.hearing_scheduled      | Hearing Scheduled          | ✅       | ✅    | ✅     |
| ce.compliance_deadline     | Compliance Deadline Set    | ✅       | ✅    | ✅     |
| ce.abatement               | Abatement Action           | ✅       | ✅    | ✅     |
| ce.appeal_filed            | Appeal Filed               | ✅       | ✅    | ✅     |
| ce.closed                  | CE Case Closed             | ✅       | ✅    |        |
| permit.created             | Permit Record Created      | ✅       | ✅    |        |
| permit.issued              | Permit Issued              | ✅       | ✅    |        |
| permit.inspection          | Permit Inspection          | ✅       | ✅    |        |
| permit.finalized           | Permit Finalized           | ✅       | ✅    |        |
| permit.expired             | Permit Expired             | ✅       | ✅    | ✅     |
| recon.started              | Recon Started              |          | ✅    |        |
| recon.completed            | Recon Completed            | ✅       | ✅    | ✅     |
| analysis.started           | Analysis Started           |          | ✅    |        |
| analysis.completed         | Analysis Completed         | ✅       | ✅    | ✅     |
| case.created               | Case Created               | ✅       | ✅    | ✅     |
| case.updated               | Case Updated               |          | ✅    |        |
| case.closed                | Case Closed                | ✅       | ✅    | ✅     |
| relationship.created       | Relationship Created       |          | ✅    |        |

---

## Relationship Type Catalog (10 types)

| Type             | Source → Target                | Example                                    |
|-----------------|----------------------------------------------------------------------------------|
| supported_by    | Finding → Evidence             | Finding is supported by this evidence      |
| mandated_by     | Finding → Statute              | Finding references this statutory requirement |
| generated_from   | Timeline Event → Evidence     | Timeline event derived from this evidence  |
| issued_by       | Evidence → Official            | Evidence was issued by this official       |
| member_of        | Official → Department          | Official is a member of this department    |
| delegated_by     | Department → Authority         | Department's authority delegated by this   |
| authorized_by   | Authority → Statute            | Authority is established by this statute   |
| references      | Finding → Statute              | Finding references (not mandated by) statute |
| relates_to       | Any → Any                      | Generic relationship                        |
| violates         | Finding → Statute              | Finding indicates deviation from statute   |

---

## Locked Contracts

### 1. Event Immutability
Events are append-only. No UPDATE, no DELETE. Any code that attempts to modify an event must fail the permission check.

### 2. Relationship Idempotency
`(source_type, source_id, target_type, target_id, relationship_type)` is unique. Creating the same relationship twice is a no-op. No duplicate `relationship.created` events.

### 3. Finding Fingerprint
`{case_id}:{jurisdiction_id}:{rule}:{evidence_id}:{detail[:200]}` — stable identity for findings. Same fingerprint = same finding. Only new fingerprints trigger `finding.created` events.

### 4. Neutrality Guardrail
AI-generated findings must never contain legal conclusions. The guardrail rewrites forbidden words ("violated" → "deviation detected", "unlawful" → "deviation detected") before storage. Enforced in code via `applyNeutralityGuardrail()` and `assertFindingNeutrality()`.

### 5. Temporal Provenance
Events carry three timestamps: `event_date` (action occurrence), `effective_date` (action takes effect), `created_at` (database insertion). Timeline sorts by `COALESCE(event_date, created_at)`.

### 6. Source-Backed Event Identity
For imported records: `(source_system, source_record_id, event_type)` is unique. Same source record = same event. No duplicates from re-importing.

### 7. Immutability Boundary
AI agents operate in the Observation and Finding layers only. They cannot modify evidence, alter events, or declare legal conclusions. Enforced in code via `checkAgentPermission()` and `assertImmutability()`.

### 8. Temporal Relationships
Relationships have `valid_from` and `valid_to`. Changing ownership ends the old relationship (set `valid_to`) and creates a new one. Active relationships: `valid_to IS NULL OR valid_to > now`.

---

## Phase 2 Backlog Items (not yet implemented)

1. **Replace semantic timeline dedup with source-backed identity** — when `source_system` is available, use `(source_system, source_record_id)` for dedup instead of `(event_type, description)`.
2. **Add `effective_date` to event emission** — for government actions with delayed effect (notice issued Jan 1, effective Jan 15).
3. **Entity resolution** — same official appearing under different IDs across data sources.
4. **Recursive graph traversal** — multi-hop authority chain queries in a single SQL CTE.
5. **Relationship versioning** — track when relationships change and maintain historical state.
