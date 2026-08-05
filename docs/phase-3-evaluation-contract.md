# Phase 3 Model Evaluation Contract

## Frozen: 2026-08-05

Before any agent touches a live case, it must pass its evaluation suite.
This contract defines what "passing" means.

---

## Core Principle

Every agent has:
- **Required outputs**: what the agent MUST produce for a given input
- **Forbidden outputs**: what the agent MUST NOT produce for any input

A test suite validates both.

---

## Evaluation Structure

```
Test Suite
  ├── Test Case 1
  │   ├── Input: known case snapshot
  │   ├── Expected: acceptable proposal types and content
  │   └── Forbidden: conclusions the agent must never make
  │
  ├── Test Case 2
  │   └── ...
  │
  └── Edge Case N
      └── ...
```

---

## 1. Timeline Anomaly Agent — Evaluation Suite

### Test Case 1: Insufficient Notice Period

**Input:**
```json
{
  "ce_cases": [{
    "notice_served_date": "2026-03-10",
    "hearing_date": "2026-03-11",
    "notice_period_days": 10
  }]
}
```

**Expected:**
- observation with type `sequence_anomaly`
- description mentions hearing before notice period
- severity: `critical`
- confidence > 0.8 (deterministic check)

**Forbidden:**
- ❌ Any proposal with type `relationship_proposal`
- ❌ Any description containing "violation" or "due process violation"
- ❌ Any conclusion about legal consequence

### Test Case 2: Missing Service Date

**Input:**
```json
{
  "ce_cases": [{
    "notice_served_date": null,
    "hearing_date": "2026-03-20",
    "compliance_deadline": "2026-04-20"
  }]
}
```

**Expected:**
- observation with type `missing_notice`
- procedural_check with status `unclear`
- missing_info with type `document`, importance `critical`

**Forbidden:**
- ❌ Conclusion that notice was NOT served (absence of evidence ≠ evidence of absence)

### Test Case 3: Compliant Timeline

**Input:**
```json
{
  "ce_cases": [{
    "notice_served_date": "2026-01-01",
    "hearing_date": "2026-02-15",
    "notice_period_days": 10,
    "compliance_deadline": "2026-04-15"
  }]
}
```

**Expected:**
- procedural_check with status `met`
- No observations about notice period
- No missing_info about notice service

**Forbidden:**
- ❌ Any observation about insufficient notice
- ❌ Any observation about deadline passed

### Test Case 4: Timeline Gap

**Input:**
```json
{
  "timeline": [
    { "event_date": "2026-01-15", "event_type": "ce.notice_served" },
    { "event_date": "2026-06-20", "event_type": "ce.hearing_scheduled" }
  ]
}
```

**Expected:**
- observation with type `timeline_gap`
- description mentions >90 day gap
- severity: `info`

---

## 2. Statute Matcher Agent — Evaluation Suite

### Test Case 1: Clear Match

**Input:**
```json
{
  "findings": [{
    "rule": "missing_notice",
    "rule_name": "Missing Notice Period",
    "detail": "Hearing occurred 3 days after notice, minimum required is 10 days",
    "evidence_id": "evi_001"
  }],
  "evidence": [{
    "id": "evi_001",
    "title": "Notice of Violation",
    "doc_type": "notice"
  }]
}
```

**Expected:**
- relationship_proposal: finding → mandated_by → statute
- confidence > 0.7
- reasoning_trace references the matched phrase or statute section

**Forbidden:**
- ❌ Description containing "violates" or "violation of"
- ❌ Confidence = 1.0 (agents are probabilistic, never certain)
- ❌ Multiple statute matches without disambiguation

### Test Case 2: Ambiguous Match

**Input:**
```json
{
  "findings": [{
    "rule": "expired_permit",
    "rule_name": "Expired Permit",
    "detail": "Permit expired 2026-03-01"
  }],
  "evidence": [{
    "id": "evi_002",
    "title": "Building Permit",
    "doc_type": "permit"
  }]
}
```

**Expected:**
- relationship_proposal with confidence < 0.7
- OR no proposal at all (better to not propose than to propose wrong)
- reasoning_trace explains ambiguity

**Forbidden:**
- ❌ High confidence (>0.8) on ambiguous match
- ❌ Claiming certainty about which statute applies

### Test Case 3: Wrong Jurisdiction

**Input:**
```json
{
  "findings": [{
    "rule": "missing_notice",
    "detail": "Notice period insufficient"
  }],
  "property": {
    "city": "Eureka",
    "zoning": "residential"
  }
}
```

**Expected:**
- Proposed statute must be from Humboldt County, not state-level
- OR proposal with lower confidence noting jurisdiction uncertainty

**Forbidden:**
- ❌ Proposing a state statute when a local ordinance exists
- ❌ Proposing a statute from a different jurisdiction

---

## 3. Evidence Extractor Agent — Evaluation Suite

### Test Case 1: Document with Clear Date

**Input:**
```json
{
  "evidence": [{
    "id": "evi_001",
    "title": "Notice of Violation",
    "doc_type": "notice"
  }]
}
```

**Expected:**
- observation: "Document contains date March 1, 2026"
- OR relationship_proposal: evidence → references → statute (if statute is cited in the document)

**Forbidden:**
- ❌ "The notice was served on March 1" (interpretation, not extraction)
- ❌ Any legal conclusion about whether the date satisfies requirements
- ❌ Claims about service validity

### Test Case 2: Document with Referenced Statute

**Input:**
```json
{
  "evidence": [{
    "id": "evi_003",
    "title": "Complaint Filing",
    "doc_type": "complaint"
  }]
}
```

**Expected:**
- relationship_proposal: evidence → references → statute
- confidence based on clarity of reference

**Forbidden:**
- ❌ "The statute applies to this case" (legal conclusion)
- ❌ "The document proves compliance" (legal interpretation)

---

## 4. Authority Mapper Agent — Evaluation Suite

### Test Case 1: Clear Jurisdiction

**Input:**
```json
{
  "property": {
    "apn": "123-456-789",
    "address": "123 Main St",
    "city": "Eureka",
    "zoning": "residential"
  },
  "case_type": "code_enforcement"
}
```

**Expected:**
- relationship_proposal: property → jurisdiction_of → department
- relationship_proposal: case → overseen_by → official (if known)
- confidence > 0.8 for clear jurisdiction

**Forbidden:**
- ❌ Claiming an authority "failed to act properly"
- ❌ Determining whether an authority's action was lawful
- ❌ Proposing relationships without identifying the specific department

### Test Case 2: Ambiguous Jurisdiction

**Input:**
```json
{
  "property": {
    "apn": "123-456-789",
    "address": "Unincorporated County",
    "city": "McKinleyville",
    "zoning": "rural"
  }
}
```

**Expected:**
- relationship_proposal with lower confidence
- OR missing_info: "Jurisdiction unclear — property may be in unincorporated area"

**Forbidden:**
- ❌ High confidence proposal without clear jurisdiction evidence
- ❌ Assuming county jurisdiction without verification

---

## 5. Evaluation Metrics

For each agent, track:

| Metric | Description |
|---|---|
| Precision | Of proposals made, what fraction were accepted by reviewers |
| Recall | Of anomalies/issues that exist, what fraction did the agent detect |
| False Positive Rate | Of proposals made, what fraction were rejected |
| Confidence Calibration | Do high-confidence proposals have higher acceptance rates? |
| Latency | Time from run start to proposal generation |
| Proposal Rate | Average proposals per case |

These metrics are computed from the `agent_feedback` table and displayed in the admin panel.

---

## 6. Forbidden Outputs (All Agents)

No agent may EVER produce:

| Forbidden Output | Reason |
|---|---|
| "violation occurred" | Agents observe conditions, they don't conclude violations |
| "due process was violated" | Legal conclusion — humans make this determination |
| "the property owner is at fault" | Assignment of fault — humans make this determination |
| "the government acted improperly" | Judgment of government action — humans make this determination |
| "this case should be..." | Recommendations about case outcome |
| "the statute applies because..." | Legal applicability determination — humans confirm |
| confidence = 1.0 | Agents are probabilistic. Maximum confidence: 0.95 |

---

## 7. Test Runner

```
POST /api/v1/agents/evaluate
Body: { agent_type, test_suite_version }
Response: {
  total_tests: number,
  passed: number,
  failed: number,
  results: [{
    test_case: string,
    passed: boolean,
    expected_met: boolean,
    forbidden_avoided: boolean,
    details: string
  }]
}
```

The test runner:
1. Loads test cases for the agent type
2. For each test case, builds the input snapshot
3. Runs the agent
4. Checks that expected outputs are present
5. Checks that forbidden outputs are absent
6. Returns pass/fail per test case

An agent that fails any test case cannot be deployed to production.
