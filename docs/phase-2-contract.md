# Phase 2 Contract: Relationship Engine + Investigation View

## Frozen: 2026-08-05

This document defines the API shapes, node types, edge types, and permission
behavior for Phase 2. No implementation begins until this contract is frozen.

---

## 1. Frontend Boundary Rule

The frontend MAY know these domain concepts:

```
Case, Property, Evidence, Event, Finding,
Relationship, Authority, Timeline, Graph
```

The frontend MAY NOT know these table names:

```
events, relationships, audit_logs, organization_members,
timeline_events, due_process_findings, building_permits,
code_enforcement_cases, recorder_records
```

The API is the boundary. The UI consumes domain APIs only.

---

## 2. Node Types

The graph has a fixed set of node types. No free-form types.

| Type | Label | Description |
|---|---|---|
| `property` | Property | A parcel of land (APN) |
| `case` | Case | A FairProcess case/project |
| `evidence` | Evidence | An uploaded document |
| `finding` | Finding | A due-process discrepancy finding |
| `event` | Event | A timeline/canonical event |
| `statute` | Statute | A legal statute or code section |
| `official` | Official | A government official |
| `department` | Department | A government department |
| `authority` | Authority | A delegated legal authority |
| `permit` | Permit | A building permit |
| `ce_case` | Code Enforcement Case | A CE case |
| `owner` | Owner | A property owner |

---

## 3. Edge Types

Edges are typed relationships from the `relationship_types` catalog (migration 005).

| Type | Source → Target | Label | Temporal |
|---|---|---|---|
| `owned_by` | property → owner | Owned By | Yes |
| `supported_by` | finding → evidence | Supported By | No |
| `mandated_by` | finding → statute | Mandated By | No |
| `generated_from` | event → evidence | Generated From | No |
| `issued_by` | ce_case → official | Issued By | No |
| `member_of` | official → department | Member Of | Yes |
| `delegated_by` | department → authority | Delegated By | Yes |
| `authorized_by` | authority → statute | Authorized By | No |
| `references` | any → any | References | No |
| `relates_to` | any → any | Relates To | No |
| `triggered_by` | event → any | Triggered By | No |
| `has_permit` | property → permit | Has Permit | No |
| `has_ce_case` | property → ce_case | Has CE Case | No |
| `has_finding` | case → finding | Has Finding | No |
| `has_evidence` | case → evidence | Has Evidence | No |

New edge types `owned_by`, `has_permit`, `has_ce_case`, `has_finding`,
`has_evidence` are derived from existing table relationships, not stored
in the `relationships` table. They are computed by the graph API.

---

## 4. Graph API Endpoints

### 4.1 Case Graph

```
GET /api/v1/cases/{id}/graph
```

Returns the complete graph for a case: all nodes and edges.

**Response shape:**

```json
{
  "case": {
    "id": "proj_123",
    "name": "123 Main St - Code Enforcement",
    "status": "open",
    "property": {
      "id": "prop_456",
      "apn": "123-456-789",
      "address": "123 Main St, Eureka, CA"
    }
  },
  "nodes": [
    {
      "type": "property",
      "id": "prop_456",
      "label": "123 Main St",
      "data": {
        "apn": "123-456-789",
        "address": "123 Main St, Eureka, CA",
        "zoning": "Residential",
        "acres": 0.25
      }
    },
    {
      "type": "case",
      "id": "proj_123",
      "label": "123 Main St - Code Enforcement",
      "data": {
        "status": "open",
        "case_type": "code_enforcement"
      }
    },
    {
      "type": "evidence",
      "id": "evi_789",
      "label": "Notice of Violation",
      "data": {
        "doc_type": "notice",
        "status": "processed",
        "uploaded_at": "2026-07-15T10:30:00Z"
      }
    }
  ],
  "edges": [
    {
      "source": "proj_123",
      "target": "prop_456",
      "type": "case_property"
    },
    {
      "source": "prop_456",
      "target": "evi_789",
      "type": "has_evidence"
    }
  ]
}
```

**Permission:** `case.read` + org-scoped to the case's organization.

### 4.2 Case Timeline

```
GET /api/v1/cases/{id}/timeline
```

Returns the ordered timeline for a case, including actor provenance.

**Response shape:**

```json
{
  "case_id": "proj_123",
  "events": [
    {
      "id": "evt_001",
      "date": "2026-03-01",
      "type": "ce.notice_served",
      "type_label": "Notice Served",
      "description": "Notice of violation served to property owner",
      "severity": "warning",
      "actor": {
        "type": "government_source",
        "id": "humboldt-code-enforcement",
        "organization_id": null
      },
      "resource_organization_id": "org_abc",
      "evidence_id": "evi_789",
      "agent_version": null
    }
  ]
}
```

**Permission:** `event.read` + org-scoped.

### 4.3 Entity Relationships

```
GET /api/v1/entities/{type}/{id}/relationships
```

Returns all relationships for a specific entity, with direction.

**Response shape:**

```json
{
  "entity": {
    "type": "finding",
    "id": "fnd_001"
  },
  "outgoing": [
    {
      "type": "supported_by",
      "type_label": "Supported By",
      "target_type": "evidence",
      "target_id": "evi_789",
      "target_label": "Notice of Violation",
      "valid_from": null,
      "valid_to": null
    }
  ],
  "incoming": [
    {
      "type": "has_finding",
      "type_label": "Has Finding",
      "source_type": "case",
      "source_id": "proj_123",
      "source_label": "123 Main St - Code Enforcement"
    }
  ]
}
```

**Permission:** `relationship.read` + org-scoped via the case.

### 4.4 Entity History

```
GET /api/v1/entities/{type}/{id}/history
```

Returns the event history for a specific entity.

**Response shape:**

```json
{
  "entity": {
    "type": "evidence",
    "id": "evi_789"
  },
  "history": [
    {
      "id": "evt_001",
      "date": "2026-07-15T10:30:00Z",
      "type": "evidence.uploaded",
      "type_label": "Evidence Uploaded",
      "actor_type": "human",
      "actor_id": "user_123",
      "actor_name": "Jane Investigator",
      "severity": "info",
      "title": "Notice of Violation uploaded",
      "description": "Document uploaded by Jane Investigator"
    }
  ]
}
```

**Permission:** `event.read` + org-scoped.

---

## 5. Derived Relationships

These edges are computed by the graph API from table joins, not stored
in the `relationships` table:

| Edge | Source Query | Join |
|---|---|---|
| `case_property` | projects | → properties (property_id) |
| `has_evidence` | projects | → evidence (project_id) |
| `has_finding` | projects | → due_process_findings (project_id) |
| `has_permit` | projects | → building_permits (project_id) |
| `has_ce_case` | projects | → code_enforcement_cases (project_id) |
| `has_recorder` | projects | → recorder_records (project_id) |
| `has_timeline` | projects | → timeline_events (project_id) |

The graph API computes these by querying the tables and constructing
the nodes + edges. The `relationships` table (migration 005) stores
semantic relationships (supported_by, mandated_by, issued_by, etc.)
that are not derivable from foreign keys.

---

## 6. Timeline + Graph Synchronization Contract

When the user selects a timeline event, the graph highlights all
nodes and edges connected to that event:

```
Event → entity_type + entity_id → node highlight
Event → evidence_id → evidence node highlight
Event → triggered_by relationships → connected nodes highlight
```

The API provides the entity reference on each timeline event.
The frontend uses that to highlight graph nodes.

No second API call needed — the timeline response includes
`entity_type`, `entity_id`, and `evidence_id` on each event.

---

## 7. Permission Behavior

All graph API endpoints:
- Require authentication (`requireAuth`)
- Require authorization (`requireAuthz` with appropriate action)
- Are org-scoped (queries include `AND organization_id = ?`)
- Return 404 (not 403) when a resource doesn't exist in the user's org
  (to prevent org enumeration)

Agent actors:
- Can read graph data (`relationship.read`, `event.read`)
- Cannot create relationships or modify evidence

---

## 8. Phase 2 Build Order

### 2.1 Graph Query API (this phase)
- `GET /api/v1/cases/{id}/graph`
- `GET /api/v1/cases/{id}/timeline`
- `GET /api/v1/entities/{type}/{id}/relationships`
- `GET /api/v1/entities/{type}/{id}/history`

### 2.2 Investigation View (next phase)
- Case Intelligence screen
- Graph visualization (interactive, not just static)
- Property → Owner → Government Actions → Evidence → Findings → Authorities

### 2.3 Timeline + Graph Sync (after)
- Click event → graph highlights connected nodes
- Click node → timeline filters to that entity's events
- The user sees "what happened, who it affected, and why it matters"

---

## 9. Response Envelope

All Phase 2 API responses use the standard envelope:

```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

Error responses:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Case not found"
  }
}
```

---

## Phase 2.2 Contract Additions: Investigation View

### Frozen: 2026-08-05

---

### 10. Case Summary API

```
GET /api/v1/cases/{id}/summary
```

Returns a computed summary that the UI should NOT calculate.

```json
{
  "case_id": "proj_123",
  "case_name": "123 Main St - Code Enforcement",
  "status": "open",
  "property": {
    "apn": "123-456-789",
    "address": "123 Main St",
    "city": "Eureka",
    "zoning": "Residential",
    "acres": 0.25
  },
  "jurisdiction": "Humboldt County",
  "case_type": "code_enforcement",
  "open_findings_count": 3,
  "critical_findings_count": 1,
  "evidence_count": 12,
  "timeline_event_count": 28,
  "last_action": {
    "date": "2026-07-20",
    "type": "ce.notice_served",
    "type_label": "Notice Served",
    "description": "Notice of violation served"
  },
  "risk_indicators": [
    {
      "label": "Critical Findings",
      "severity": "critical",
      "detail": "1 critical due-process finding(s) open"
    }
  ]
}
```

### 11. Edge Provenance

Semantic edges (from the relationships table) carry provenance:

```json
{
  "provenance": {
    "source": "relationship_table",
    "created_by": "statute-analysis-agent",
    "created_by_type": "agent",
    "created_at": "2026-07-15T10:30:00Z",
    "confidence": 0.91,
    "evidence_ids": ["evi_001", "evi_002"],
    "notes": "Inferred from notice + statute comparison"
  }
}
```

Derived edges (from table joins) carry minimal provenance:

```json
{
  "provenance": {
    "source": "derived"
  }
}
```

### 12. Investigation View Model

The Investigation View has six panels:

| Panel | Content | Data Source |
|---|---|---|
| Case Overview | Property, jurisdiction, status, risk indicators | Case Summary API |
| Timeline | Chronological events with actor provenance | Case Timeline API |
| Graph Context | Interactive node-link visualization | Case Graph API |
| Evidence Panel | Evidence list with status + download | Evidence API (existing) |
| Finding Panel | Due-process findings with severity | Findings API (existing) |
| Authority Panel | Statutes, officials, departments, authorities | Entity Relationships API |

### 13. Graph Interaction Rules

| Action | Result |
|---|---|
| Click node | Detail panel shows node info + relationships |
| Click edge | Provenance panel shows who/when/confidence/evidence |
| Click timeline event | Graph highlights connected nodes |
| Filter by entity type | Show/hide node types (property, evidence, finding, etc.) |
| Filter by date range | Timeline + graph show only events in range |
| Hover node | Tooltip with label + type |
| Hover edge | Tooltip with type label + provenance source |

### 14. Layout

```
┌──────────────────────────────────────────┐
│ CASE HEADER                              │
│ Property • Jurisdiction • Status • Risks │
└──────────────────────────────────────────┘
┌───────────────────┬──────────────────────┐
│                   │                      │
│ Timeline          │ Relationship Graph   │
│                   │                      │
│ (scrollable)      │ (interactive)        │
│                   │                      │
└───────────────────┴──────────────────────┘
┌──────────────────────────────────────────┐
│ Evidence / Findings / Authority Details  │
│ (tabbed)                                 │
└──────────────────────────────────────────┘
```

The timeline drives the investigation.
The graph supports the timeline.
The details panel supports both.

### 15. Graph Limits

The initial graph view shows at most:
- 50 nodes
- 100 edges

If the case has more, the UI shows a "Showing top 50 of N nodes" message
with a filter to narrow by entity type. The graph engine knows everything;
the user sees only what matters.

---

## Phase 2.3 Contract Additions: Investigation Intelligence

### Frozen: 2026-08-05

---

### 16. Edge Lifecycle

Semantic edges have a lifecycle:

```
pending_review → accepted | rejected | superseded
```

- `pending_review` (default): AI-proposed edge awaiting human review
- `accepted`: Human reviewer confirmed the edge is valid
- `rejected`: Human reviewer rejected the edge (stays in DB with reason)
- `superseded`: Replaced by a newer edge (superseded_by references the replacement)

Rejected edges are visible in the graph (dashed red) with the review reason.
Superseded edges are filtered from the graph view but remain in the database.

### 17. Investigation Focus API

```
GET /api/v1/cases/{id}/focus
```

Returns structured analysis — NOT violations. Neutral language only.

```json
{
  "case_id": "proj_123",
  "generated_at": "2026-08-05T00:25:00Z",
  "observations": [
    {
      "type": "sequence_anomaly",
      "description": "Hearing occurred 3 days after notice, required minimum is 10 days",
      "date": "2026-03-20",
      "severity": "critical",
      "related_entity_type": "ce_case",
      "related_entity_id": "ce_001"
    }
  ],
  "procedural_checks": [
    {
      "requirement": "Notice period before hearing",
      "status": "missing",
      "evidence_ids": [],
      "detail": "3 days between notice and hearing, required: 10"
    }
  ],
  "supporting_evidence": [
    {
      "evidence_id": "evi_001",
      "evidence_title": "Notice of Violation",
      "relevance": "notice"
    }
  ],
  "missing_information": [
    {
      "description": "Proof of notice service for CE case CE-2026-001",
      "type": "document",
      "importance": "critical"
    }
  ]
}
```

Observation types: timeline_gap, sequence_anomaly, missing_notice,
deadline_passed, authority_gap, evidence_gap.

Procedural check statuses: met, unclear, missing, not_applicable.

Missing information importance: critical, recommended, optional.

### 18. "Why am I seeing this?" API

```
GET /api/v1/cases/{id}/explain?nodeId=X
```

Returns all reasons why a node appears in the graph:

```json
{
  "node_id": "evi_001",
  "node_type": "evidence",
  "node_label": "Notice of Violation",
  "reasons": [
    {
      "source": "direct_relationship",
      "description": "Connected to Case via has_evidence"
    },
    {
      "source": "timeline_event",
      "description": "Referenced by timeline event Evidence Uploaded on 2026-07-15"
    },
    {
      "source": "finding_reference",
      "description": "Referenced by finding Missing notice period (critical severity)"
    }
  ]
}
```

Every AI-derived element answers "why is this here?"

### 19. Graph Relevance Scoring

Nodes carry a relevance_score (0-100). Higher = more relevant.

Factors:
- +30  Direct case/property relationship
- +20  Open finding
- +10  Critical finding severity
- +15  Processed, non-withdrawn evidence
- +10  Recent timeline event (last 30 days)
- +10  High-confidence semantic edge (≥ 0.8)
- +5   Per connected edge (max +20)

Nodes with relevance ≥ 50 display a gold arc indicator.
Node size scales proportionally with relevance.

### 20. Hierarchical Graph Layout

Replaced circular layout with directed hierarchical layout:

```
Layer 0: Case node (top center)
Layer 1: Property (below case)
Layer 2: Evidence + Findings (radiate from case)
Layer 3: Permits + CE Cases + Events (below property)
Layer 4: Authority chain (statutes, officials, departments)
```

Maps to causality, not topology.
