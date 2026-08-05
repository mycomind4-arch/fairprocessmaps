# Phase 3 Contract: Agent Operating Model

## Frozen: 2026-08-05

This document defines how AI agents participate in FairProcess.

It is a contract, not a suggestion. Every agent implementation must comply.

---

## Core Principle

> AI does not become the source of truth.
> AI becomes a provenance-producing participant in the system.

Agents are controlled investigators. Their outputs enter the same review
lifecycle as any other evidence-derived assertion. No agent output becomes
canonical knowledge without human review.

---

## 1. Agent Capability Boundary

### Agent CAN create:

| Output | Enters System As | Review Required |
|---|---|---|
| Observations | `investigation_focus.observations[]` | Yes — human confirms |
| Evidence links | `relationships` (semantic, pending_review) | Yes — human accepts/rejects |
| Proposed relationships | `relationships` (semantic, pending_review) | Yes — human accepts/rejects |
| Procedural checks | `investigation_focus.procedural_checks[]` | Yes — human confirms status |
| Missing information requests | `investigation_focus.missing_information[]` | Yes — human prioritizes |
| Timeline annotations | `timeline_events` (actor_type=agent) | No — informational only |
| Evidence metadata extraction | `evidence` fields (doc_type, parties, dates) | No — factual extraction |

### Agent CANNOT create:

| Prohibited Output | Reason |
|---|---|
| Legal conclusions | Agents do not make legal determinations |
| Accepted relationships | Only human reviewers can accept (relationship.review) |
| Final findings | Findings require human authorization |
| Authority determinations | Agents cannot determine which authority applies |
| External communications | Agents cannot send emails, file documents, or contact parties |
| Evidence deletion or withdrawal | Agents cannot destroy or suppress evidence |
| User accounts or permissions | Agents cannot modify identity or authorization |
| Case status changes | Agents cannot open, close, or reassign cases |

---

## 2. Agent Action Record

Every agent action that produces a graph assertion, observation, or
procedural check MUST record:

```json
{
  "agent_id": "agent.statute_matcher.v1",
  "agent_version": "1.2.0",
  "model_version": "claude-sonnet-4-20250514",
  "input_evidence_ids": ["evi_001", "evi_003"],
  "input_context": {
    "case_id": "proj_123",
    "jurisdiction": "Humboldt County",
    "case_type": "code_enforcement"
  },
  "generated_output_type": "relationship_proposal",
  "generated_output": {
    "source_type": "finding",
    "source_id": "finding_001",
    "target_type": "statute",
    "target_id": "statute_humboldt_8.12.040",
    "relationship_type": "mandated_by",
    "confidence": 0.87
  },
  "confidence": 0.87,
  "timestamp": "2026-08-05T00:30:00Z",
  "reasoning_trace": "Matched phrase 'failure to provide adequate notice' in evidence evi_001 against Humboldt County Code 8.12.040(b)(2). Confidence reduced from 0.95 to 0.87 due to incomplete jurisdiction verification."
}
```

### Required Fields

| Field | Purpose | Stored In |
|---|---|---|
| `agent_id` | Identifies which agent (unique per agent type) | `relationships.created_by` |
| `agent_version` | Version of the agent code that ran | `relationships.notes` (JSON) |
| `model_version` | Underlying LLM model version | `relationships.notes` (JSON) |
| `input_evidence_ids` | What evidence the agent examined | `relationships.evidence_ids` |
| `input_context` | Case context the agent operated within | Not persisted (audit log only) |
| `generated_output_type` | What kind of output (relationship_proposal, observation, procedural_check) | Implied by target table |
| `generated_output` | The actual proposed assertion | Row in `relationships` or `investigation_focus` |
| `confidence` | Agent's self-assessed confidence (0-1) | `relationships.confidence` |
| `timestamp` | When the agent ran | `relationships.created_at` |
| `reasoning_trace` | Human-readable explanation of the agent's reasoning | `relationships.notes` |

### Persistence Rule

- Relationship proposals → `relationships` table with `status='pending_review'`,
  `created_by_type='agent'`, `created_by=agent_id`
- Observations and procedural checks → stored as agent-generated entries
  in a new `agent_proposals` table (migration 012), NOT directly in the
  canonical `investigation_focus` response
- The `buildInvestigationFocus` function reads from BOTH the canonical
  tables (deterministic checks) AND `agent_proposals` (AI-generated
  observations), but marks agent-generated observations with
  `source: "agent"` in the response

---

## 3. Agent Simulation Environment (Sandbox)

Before agents touch live cases, they run in a sandbox.

### Sandbox Contract

```
Agent Sandbox

Input:  Copy of case graph (read-only snapshot)
Output: Proposals only (no writes to canonical graph)
```

### Flow

```
Agent runs
    |
    v
Proposed Observation / Relationship / Check
    |
    v
Stored in agent_proposals (status=pending)
    |
    v
Human Review (accept / reject / request revision)
    |
    v
If accepted: promoted to canonical graph
If rejected: stays in agent_proposals with reason
```

### Sandbox Implementation

1. Agent receives a **snapshot** of the case graph (nodes, edges, timeline, evidence metadata)
2. Agent produces proposals (observations, relationships, checks, missing info)
3. Proposals are written to `agent_proposals` table with `status='pending'`
4. Proposals do NOT appear in the canonical graph, timeline, or investigation focus
5. A human reviewer sees pending proposals in a review queue
6. On acceptance:
   - Relationship proposals → inserted into `relationships` with `status='pending_review'`
   - Observation proposals → marked `status='accepted'` in `agent_proposals`, included in `investigation_focus`
   - Check proposals → marked `status='accepted'`, included in `investigation_focus`
7. On rejection:
   - Proposal stays in `agent_proposals` with `status='rejected'`, `review_reason`, `reviewed_by`
   - Never enters canonical graph

### Sandbox API

```
POST /api/v1/cases/{id}/agents/run
  Body: { agent_id, agent_version, input_context }
  Response: { proposals: [...], agent_run_id }

GET /api/v1/cases/{id}/agents/proposals
  Query: status=pending|accepted|rejected
  Response: { proposals: [...] }

PATCH /api/v1/agents/proposals/{id}/review
  Body: { status: accepted|rejected, review_reason }
  Permission: agent.review
```

---

## 4. Agent Types

### Phase 3.1: Statute Matcher Agent

**Purpose**: Match findings to applicable statutes/ordinances.

```
Input:
  - Finding (rule, detail, evidence_id)
  - Jurisdiction
  - Evidence text (extracted from evidence PDF)

Output:
  - Proposed relationship: finding → mandated_by → statute
  - Confidence (0-1)
  - Reasoning trace (matched phrase, statute citation)
```

**Cannot**: Determine if the statute actually applies. Only proposes the match.

### Phase 3.2: Timeline Anomaly Agent

**Purpose**: Detect procedural sequence anomalies.

```
Input:
  - Case timeline (ordered events)
  - CE case data (notice date, hearing date, compliance deadline)
  - Permit data (issued, expired, finalized)

Output:
  - Observations (sequence_anomaly, missing_notice, deadline_passed)
  - Procedural checks (notice period, compliance deadline)
  - Missing information (missing service records, missing dates)
```

**Cannot**: Conclude a violation occurred. Only observes conditions.

### Phase 3.3: Evidence Extraction Agent

**Purpose**: Extract structured metadata from evidence documents.

```
Input:
  - Evidence document (PDF text, OCR output)
  - Document type hint

Output:
  - Evidence metadata: doc_type, parties, dates, referenced statutes
  - Proposed relationships: evidence → references → statute
  - Timeline annotations: evidence.uploaded (already exists) +
    evidence.extracted (new, agent-generated)
```

**Cannot**: Interpret legal significance. Only extracts facts present in the document.

### Phase 3.4: Authority Mapping Agent

**Purpose**: Map which government authorities have jurisdiction over
the property and case.

```
Input:
  - Property (APN, address, city, zoning)
  - Case type
  - Jurisdiction

Output:
  - Proposed relationships: property → jurisdiction_of → department
  - Proposed relationships: case → overseen_by → official
  - Missing information: unidentified authority gaps
```

**Cannot**: Determine if an authority acted properly. Only identifies
which authorities are relevant.

---

## 5. Agent Permission Matrix

| Action | Agent | Investigator | Reviewer | Attorney | Admin |
|---|---|---|---|---|---|
| Read case graph | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read evidence metadata | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read timeline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read evidence content (PDF text) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create relationship proposal | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create observation proposal | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create procedural check proposal | ✅ | ❌ | ❌ | ❌ | ❌ |
| Accept relationship | ❌ | ❌ | ✅ | ✅ | ✅ |
| Reject relationship | ❌ | ❌ | ✅ | ✅ | ✅ |
| Accept agent proposal | ❌ | ❌ | ✅ | ✅ | ✅ |
| Reject agent proposal | ❌ | ❌ | ✅ | ✅ | ✅ |
| Modify evidence | ❌ | ✅ | ❌ | ✅ | ✅ |
| Modify findings | ❌ | ❌ | ✅ | ✅ | ✅ |
| Change case status | ❌ | ❌ | ❌ | ❌ | ✅ |
| Send external communications | ❌ | ❌ | ❌ | ❌ | ❌ |

Note: Agents have MORE observation capability than investigators (they
can create procedural check proposals) but LESS modification capability
than any human role. This is intentional — agents are prolific proposers
but have zero write authority to canonical data.

---

## 6. Agent Proposal Lifecycle

```
agent_proposals
     |
     v
pending
     |
     +--> accepted (human review)
     |        |
     |        v
     |    Canonical graph update
     |    (relationship inserted, observation included in focus)
     |
     +--> rejected (human review)
     |        |
     |        v
     |    Stays in agent_proposals
     |    (review_reason recorded)
     |
     +--> superseded (newer proposal replaces)
              |
              v
          Original marked superseded
          New proposal enters pending
```

### Status Values

| Status | Meaning | Visible in Canonical Graph |
|---|---|---|
| `pending` | Awaiting human review | No |
| `accepted` | Human confirmed the proposal | Yes — promoted to canonical |
| `rejected` | Human rejected the proposal | No — stays in proposals table |
| `superseded` | Replaced by a newer proposal | No |

---

## 7. Audit Trail

Every agent action creates an audit log entry:

```json
{
  "event_type": "agent.proposal_created",
  "actor_type": "agent",
  "actor_id": "agent.statute_matcher.v1",
  "actor_organization_id": "org_123",
  "resource_organization_id": "org_123",
  "entity_type": "agent_proposal",
  "entity_id": "proposal_001",
  "metadata": {
    "agent_version": "1.2.0",
    "model_version": "claude-sonnet-4-20250514",
    "proposal_type": "relationship_proposal",
    "confidence": 0.87
  }
}
```

Every human review of an agent proposal creates:

```json
{
  "event_type": "agent.proposal_reviewed",
  "actor_type": "human",
  "actor_id": "user_123",
  "actor_organization_id": "org_123",
  "resource_organization_id": "org_123",
  "entity_type": "agent_proposal",
  "entity_id": "proposal_001",
  "metadata": {
    "review_decision": "accepted",
    "review_reason": null
  }
}
```

---

## 8. Data Model: agent_proposals Table (Migration 012)

```sql
CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL,

  -- Agent identification
  agent_id TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  model_version TEXT,

  -- Proposal content
  proposal_type TEXT NOT NULL,
    -- relationship_proposal | observation | procedural_check | missing_info

  -- For relationship proposals
  source_type TEXT,
  source_id TEXT,
  target_type TEXT,
  target_id TEXT,
  relationship_type TEXT,

  -- For observations / checks / missing info
  observation_type TEXT,
  description TEXT,
  severity TEXT,
  requirement TEXT,
  check_status TEXT,
  detail TEXT,
  info_type TEXT,
  importance TEXT,

  -- Provenance
  confidence REAL,
  evidence_ids TEXT,  -- JSON array
  reasoning_trace TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'pending',
    -- pending | accepted | rejected | superseded

  -- Review
  reviewed_by TEXT,
  reviewed_by_type TEXT,
  reviewed_at TEXT,
  review_reason TEXT,

  -- Supersession
  superseded_by TEXT REFERENCES agent_proposals(id),

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (case_id) REFERENCES projects(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_case_status ON agent_proposals(case_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_agent ON agent_proposals(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_org ON agent_proposals(organization_id, status);
```

---

## 9. Agent Review Queue UI

The Investigation View gets a new tab in the Detail Panel: **Agent Proposals**.

### Pending Proposals View

Shows all `pending` agent proposals for the case:

```
┌─────────────────────────────────────────────┐
│ Agent Proposals (3 pending)                 │
├─────────────────────────────────────────────┤
│ 🤖 statute_matcher.v1                       │
│ Proposed: finding → mandated_by → §8.12.040 │
│ Confidence: 87%                              │
│ Evidence: Notice PDF (page 4)                │
│ Reasoning: Matched phrase "failure to        │
│ provide adequate notice"                    │
│                                              │
│ [Accept]  [Reject]  [Request Revision]       │
├─────────────────────────────────────────────┤
│ 🤖 timeline_anomaly.v1                       │
│ Proposed: sequence_anomaly observation       │
│ Hearing occurred 3 days after notice         │
│ Required minimum: 10 days                   │
│ Confidence: 100% (deterministic)             │
│                                              │
│ [Accept]  [Reject]                           │
└─────────────────────────────────────────────┘
```

### Accepted/Rejected History

Collapsible section showing reviewed proposals with decision and reason.

---

## 10. Agent Run Logging

Each agent execution creates a run record:

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  model_version TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT DEFAULT 'running',
    -- running | completed | failed
  input_snapshot TEXT,  -- JSON: graph snapshot the agent received
  proposal_count INTEGER DEFAULT 0,
  error_message TEXT,
  FOREIGN KEY (case_id) REFERENCES projects(id)
);
```

This enables:
- Audit trail of every agent execution
- Reproducibility (same input snapshot → same proposals)
- Performance monitoring (time from started_at to completed_at)
- Error tracking (failed runs with error_message)

---

## 11. Non-Goals (Phase 3)

These are explicitly NOT in Phase 3:

- **Autonomous agents**: Agents do not run without human initiation
- **Agent-to-agent communication**: Agents do not talk to each other
- **Real-time streaming**: Agent proposals are batch, not streaming
- **External actions**: Agents cannot send emails, file documents, or contact parties
- **Legal conclusions**: Agents observe conditions, they do not conclude violations
- **Self-review**: Agents cannot accept or reject their own proposals
- **Model selection**: Agents use a fixed model version specified at deployment time

---

## 12. Build Sequence

### Phase 3.1: Agent Infrastructure
1. Migration 012: `agent_proposals` and `agent_runs` tables
2. Agent run API: `POST /api/v1/cases/{id}/agents/run`
3. Agent proposal review API: `PATCH /api/v1/agents/proposals/{id}/review`
4. Agent proposals list API: `GET /api/v1/cases/{id}/agents/proposals`
5. `agent.review` permission added to reviewer, attorney, admin roles
6. Agent proposal builder in `lib/graph/builder.ts`
7. Investigation Focus API updated to include accepted agent observations
8. Detail Panel: new "Agent Proposals" tab

### Phase 3.2: Statute Matcher Agent
1. Agent definition: `lib/agents/statute-matcher.ts`
2. Input: finding + evidence text + jurisdiction
3. Output: relationship proposals (finding → mandated_by → statute)
4. Runs in sandbox (proposals only, no canonical writes)
5. Confidence scoring based on phrase matching + jurisdiction verification

### Phase 3.3: Timeline Anomaly Agent
1. Agent definition: `lib/agents/timeline-anomaly.ts`
2. Input: case timeline + CE case data + permit data
3. Output: observation proposals + procedural check proposals
4. Replaces the current deterministic checks in `buildInvestigationFocus`
   with agent-generated proposals (same logic, now properly traced)

### Phase 3.4: Evidence Extraction Agent
1. Agent definition: `lib/agents/evidence-extractor.ts`
2. Input: evidence document text
3. Output: evidence metadata updates + relationship proposals

### Phase 3.5: Authority Mapping Agent
1. Agent definition: `lib/agents/authority-mapper.ts`
2. Input: property + case type + jurisdiction
3. Output: relationship proposals (property → jurisdiction_of → department)

---

## 13. Security Considerations

- Agent proposals are org-scoped (organization_id on every row)
- Agent run snapshots do not include evidence content (only metadata + extracted text)
- Agent proposals inherit the case's organization_id, not the agent's
- Agent review requires `agent.review` permission (not `relationship.review`)
- Accepted agent proposals that become relationships still enter
  `relationships` with `status='pending_review'` — they require a SECOND
  review to become accepted relationships (double review for AI-generated assertions)
- Rejected proposals are never deleted — they remain in `agent_proposals`
  with the review reason for institutional memory
