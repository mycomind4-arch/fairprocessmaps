# FairProcessMaps — UI/UX Optimization Plan

## Current Information Architecture

### Current Navigation (ProjectNav.tsx)

```
CASE BUILDING
├── Property Intelligence (intelligence) — CaseIntelligencePanel
│   ├── Sub-tab: Case Overview → OverviewPanel
│   └── Sub-tab: Property Details → PropertyIntelligence
├── Timeline (timeline) — TimelinePanel
│   ├── Sub-tab: Timeline
│   ├── Sub-tab: Event Reconstruction → EventReconstruction
│   └── Sub-tab: Procedural Clock → ProceduralClock
├── Authority & Enforcement (authority) — AuthorityEnforcementPanel
│   ├── Sub-tab: Agencies & Departments → BuildingDeptPanel / CodeEnforcementPanel
│   ├── Sub-tab: Chain of Authority → static placeholder
│   ├── Sub-tab: Enforcement Actions → CodeEnforcementPanel (duplicate)
│   └── Sub-tab: Legal Authority → static placeholder
└── Evidence (vault) — EvidenceVaultPanel

ANALYSIS & DEFENSE
├── Legal Analysis (legal) — LegalAnalysisPanel
│   ├── Sub-tab: Due Process Findings → DiscrepanciesPanel
│   ├── Sub-tab: Legal & Law Library → LegalLibraryPanel
│   └── Sub-tab: Brief Generator → BriefGeneratorPanel
└── Defense Builder (defense-builder) — DefenseBuilderPanel

SYSTEM
├── Connectors & Skills (connectors) — ConnectorsPanel
└── Admin (admin) — AdminPanel

GRAPH (hidden nav, accessible via intelligence tab toggle)
└── InvestigationGraph + TimelineList + DetailPanel
```

### Problems with Current IA

1. **Overview layer is redundant** — CaseIntelligencePanel wraps OverviewPanel + PropertyIntelligence behind sub-tabs. Overview duplicates project metadata, metric cards, and recent activity that either exist in Property Intelligence or are thin wrappers.

2. **Authority & Enforcement has duplicates** — CodeEnforcementPanel appears twice (once under "Agencies", once under "Enforcement Actions"). BuildingDeptPanel is separate but should be unified. Chain of Authority and Legal Authority are static placeholder content.

3. **Timeline is underutilized** — Only chronological list mode exists. No episodes, no evidence-focused view, no authority view, no zoom levels, no anomaly visualization.

4. **Graph is orphaned** — Lives as a hidden section toggled from intelligence. Not integrated with Timeline, Authority, or Evidence. Selecting a node doesn't cross-highlight in other views.

5. **Analysis is split across two nav entries** — Legal Analysis (findings, library, briefs) and Defense Builder are separate but conceptually related.

6. **No AI Review workspace** — Agent proposals, observations, and anomalies exist in backend tables (agent_proposals, agent_runs, agent_feedback) but have no dedicated UI workspace.

7. **No Investigation Brief** — Property Intelligence lacks a situation/known/uncertain/attention/recent/next-best-action summary component.

8. **Global Search is limited** — Only searches properties, evidence, and timeline events. No people, positions, departments, agencies, statutes, or cases.

---

## New Information Architecture

```
PROPERTY INTELLIGENCE        — Primary landing, investigation brief, property identity + intel
AUTHORITY & ENFORCEMENT      — Unified chain of authority, action→actor→authority, org + action views
TIMELINE                     — Multi-mode timeline (chronological, episodes, evidence, authority)
EVIDENCE                     — Evidence vault with provenance, connections, source documents
ANALYSIS                     — Findings, procedural checks, contradictions, statute matches
AI REVIEW                    — AI observations, anomalies, proposals pending human review
```

### Navigation Changes

| Old | New | Action |
|-----|-----|--------|
| CaseIntelligencePanel (Overview + PropertyIntelligence) | Property Intelligence | Remove Overview entirely, merge key info into PropertyIntelligence |
| AuthorityEnforcementPanel | Authority & Enforcement | Merge BuildingDept + CodeEnforcement, add Chain of Authority, action-centered view |
| TimelinePanel | Timeline | Add episodes, evidence, authority modes; add zoom, filters, anomaly display |
| EvidenceVaultPanel | Evidence | Add provenance, connections, source document display |
| LegalAnalysisPanel + DefenseBuilderPanel | Analysis | Merge findings, contradictions, statute matches, defense arguments |
| (new) | AI Review | New workspace for agent proposals, observations, anomalies |
| ConnectorsPanel | System → Connectors | Demote to system section, not primary nav |
| AdminPanel | System → Admin | Demote to system section |
| Graph (hidden) | Integrated | Embed graph panels within Timeline, Authority, Evidence; remove standalone section |

---

## 1. Property Intelligence Redesign

### Purpose
Primary landing page. Answers: "What is this property and what is happening around it?"

### Components

**Investigation Brief** (new component, top of page)
- Situation: what is happening with the property
- Known: evidence-backed facts
- Uncertain: important unresolved facts
- Attention: items that deserve investigation (linked)
- Recent activity: what changed recently
- Next best action: what the investigator should consider doing next

**Property Identity**
- Address, APN, parcel, jurisdiction, owner/entity, property type, investigation status

**Property Intelligence**
- Enforcement activity, building activity, permits, inspections, notices, hearings, orders
- Property history, agencies involved, people involved
- Active issues, evidence count, timeline span

**Needs Attention** (replaces OverviewPanel's recent activity)
- New activity, missing evidence, conflicting records, timeline anomalies
- Unreviewed AI proposals, authority questions, important deadlines
- Unresolved investigation questions
- Every item links to the underlying object/evidence

### Files Removed
- `OverviewPanel.tsx` — DELETED
- `CaseIntelligencePanel.tsx` — DELETED (sub-tab wrapper no longer needed)

### Files Modified
- `PropertyIntelligence.tsx` — Major rewrite: add Investigation Brief, Needs Attention, enhanced property intel
- `project/[id]/page.tsx` — Wire PropertyIntelligence directly (no CaseIntelligencePanel wrapper)

---

## 2. Authority & Enforcement Redesign

### Purpose
Answers: "Who is responsible, what position, where in the hierarchy, what authority connects them?"

### Components

**View Switcher**: Organization View | Action View

**Organization View** (chain of authority)
- County → Department → Division → Position → Person
- Interactive nodes, click to expand authority details
- Current vs Historical vs Unknown position holders

**Action View** (action-centered)
- For every government action: WHO, ROLE, ORGANIZATION, AUTHORITY, WHEN, EVIDENCE, STATUS
- Status: Verified / Supported / Unconfirmed / Disputed / Unknown

**Merged Panels**
- BuildingDeptPanel + CodeEnforcementPanel → unified enforcement data display
- No separate sub-tabs for building vs code enforcement

### Files Removed
- `BuildingDeptPanel.tsx` — DELETED (merged into AuthorityEnforcementPanel)
- `CodeEnforcementPanel.tsx` — DELETED (merged into AuthorityEnforcementPanel)

### Files Modified
- `AuthorityEnforcementPanel.tsx` — Major rewrite

---

## 3. Timeline Redesign

### Purpose
One of the most sophisticated areas. Not a simple chronological list.

### Timeline Modes
1. **Chronological** — everything in time order
2. **Episodes** — auto-grouped related activity (complaint→inspection→notice→reinspection→hearing→order)
3. **Evidence** — focus on source documents and their relationship to events
4. **Authority** — which people/positions/agencies were involved at each point in time

### Timeline Controls
- Year/month/week/day zoom
- Date range filter
- Event type, agency, person, position, evidence, authority, AI observations, status filters

### Timeline Event Detail Panel
- What happened, exact date/time, actor, position, department, authority
- Evidence, source, related events, before/after relationships
- AI observations, review status

### Temporal Authority (signature feature)
- Reconstruct who held the relevant position when an action occurred
- Place enforcement actions on the same temporal axis as position holders
- Never present inferred relationships as fact

### Timeline Anomalies
- Missing procedural steps (inspection→notice→⚠ missing→hearing)
- Date conflicts (agency record vs notice vs document metadata)
- Selecting anomaly exposes underlying evidence

### Files Modified
- `TimelinePanel.tsx` — Major rewrite with multi-mode support
- `EventReconstruction.tsx` — Integrated as "Episodes" mode
- `ProceduralClock.tsx` — Integrated as deadline display within timeline

---

## 4. Evidence Redesign

### Purpose
Evidence is the authoritative foundation. Every important object connects to evidence.

### Enhancements
- Source, original document, retrieval date, evidence type, provenance
- Related events, related people, related authority, related findings
- Always answer: "Where did this information come from?"

### Files Modified
- `EvidenceVaultPanel.tsx` — Add provenance display, related objects

---

## 5. Analysis Redesign

### Purpose
Findings, procedural checks, contradictions, missing evidence, statute matches, authority questions, unresolved questions.

### Key Distinction
- **FACT**: Evidence-backed observation
- **POTENTIAL ISSUE**: Evidence-backed discrepancy or question
- **LEGAL CONCLUSION**: Human determination (AI must not collapse these)

### Merged Content
- DiscrepanciesPanel (findings) → main Analysis view
- DefenseBuilderPanel → Analysis sub-section
- LegalLibraryPanel → Analysis sub-section (statute reference)
- BriefGeneratorPanel → Analysis sub-section (document generation)

### Files Modified
- `LegalAnalysisPanel.tsx` — Restructured to hold findings, defense, library, briefs
- `DiscrepanciesPanel.tsx` — Enhanced with FACT/POTENTIAL ISSUE/LEGAL CONCLUSION labels

---

## 6. AI Review (New)

### Purpose
AI investigation-support workspace. Not a chatbot. Shows what the system has identified for human review.

### Content
- New observations, timeline anomalies, contradictions, missing evidence
- Authority questions, statute matches, suggested research
- Pending human review items
- Every AI item links to supporting evidence

### Backend Data Sources
- `agent_proposals` table — AI-generated proposals
- `agent_runs` table — Agent execution history
- `agent_feedback` table — Human feedback on AI proposals
- `due_process_findings` with `missing_info` flag — AI-identified gaps

### New Files
- `AIReviewPanel.tsx` — New component
- API: extend existing `/api/v1/cases/[id]/agents/proposals` route

---

## 7. Graph Integration

### Approach
Graph is NOT a standalone section. Integrate into:
- Property Intelligence: mini relationship graph
- Authority & Enforcement: org hierarchy visualization
- Timeline: temporal relationship view
- Evidence: document relationship graph

### Cross-highlighting
- Select timeline event → highlight in graph
- Select graph node → locate in timeline

### Files Modified
- `project/[id]/page.tsx` — Remove standalone graph section
- `InvestigationGraph.tsx` — Make embeddable, smaller variants

---

## 8. Global Search

### Scope
Properties, APNs, owners, investigations, cases, people, positions, departments, agencies, enforcement actions, documents, statutes, timeline events

### Files Modified
- `SearchBar.tsx` — Expand search scope
- `/api/v1/search/route.ts` — Expand backend search

---

## 9. Design System

### Principles
- Professional, investigative, evidence-driven
- Calm, precise, trustworthy
- Dense where useful, spacious where appropriate

### Avoid
- Giant dashboard metric cards, excessive gradients, decorative AI effects
- Excessive glassmorphism, unnecessary animation, dashboard clutter, redundant information

### Use
- Existing FP design tokens (fp-blue, fp-text, fp-border, etc.)
- surface-flat for secondary content, glass for primary
- Consistent spacing (p-3/p-4/p-5), radius (rounded-xl cards, rounded-lg inputs)

---

## 10. Backend Requirements

### Already Available
- Properties, projects, evidence, timeline_events, due_process_findings
- building_permits, code_enforcement_cases, property_intelligence
- agent_proposals, agent_runs, agent_feedback
- statutes, generated_briefs
- events, relationships (knowledge graph)
- /api/v1/overview (project summary data)
- /api/v1/findings (findings + analysis)
- /api/v1/cases/[id]/agents/proposals (AI proposals)

### Needed for Full Spec (Documented as Backend Requirements)

1. **Position holders** — No table currently tracks who held a position at a given time. Need:
   - `position_holders` table: position_id, person_name, start_date, end_date, source_evidence_id
   - API: `/api/v1/positions/[id]/holders`

2. **Authority chain data** — Current Chain of Authority is static placeholder. Need:
   - `authority_chains` table: jurisdiction, department, division, position, authority_source
   - API: `/api/v1/authority/chain?projectId=X`

3. **Episode grouping** — Timeline episodes require backend grouping logic. Need:
   - API: `/api/v1/timeline/episodes?projectId=X` that groups related events
   - Or client-side grouping algorithm with defined episode patterns

4. **Timeline anomalies** — Currently findings exist but aren't positioned on the timeline. Need:
   - API: `/api/v1/timeline/anomalies?projectId=X` that returns anomalies with positions

5. **Global search expansion** — Current search only covers properties, evidence, timeline. Need:
   - Expand `/api/v1/search` to also search: people, positions, departments, statutes, cases

6. **AI Review aggregation** — Need:
   - API: `/api/v1/cases/[id]/ai-review` that aggregates proposals, anomalies, observations

---

## 11. Implementation Phases

### Phase 1: IA Restructure (Core Nav)
- Update ProjectNav to new 6-item structure
- Remove OverviewPanel, CaseIntelligencePanel
- Wire PropertyIntelligence as primary landing
- Merge LegalAnalysisPanel + DefenseBuilderPanel into Analysis
- Create AIReviewPanel placeholder
- Demote Connectors + Admin to secondary nav

### Phase 2: Property Intelligence Enhancement
- Add Investigation Brief component
- Add Needs Attention section
- Integrate overview API data into PropertyIntelligence

### Phase 3: Authority & Enforcement Rewrite
- Merge BuildingDept + CodeEnforcement
- Add Organization View / Action View switcher
- Add action→actor→position→authority→evidence display
- Add temporal position holder display

### Phase 4: Timeline Enhancement
- Add multi-mode support (chronological, episodes, evidence, authority)
- Add zoom controls and filters
- Add anomaly visualization
- Add temporal authority overlay
- Integrate EventReconstruction and ProceduralClock

### Phase 5: Evidence Enhancement
- Add provenance display
- Add related objects connections
- Add source document linking

### Phase 6: AI Review
- Build AIReviewPanel with proposal/observation display
- Wire to agent_proposals, agent_runs, findings with missing_info
- Add human review workflow (approve/reject/request-info)

### Phase 7: Graph Integration
- Embed mini-graph in Property Intelligence
- Add graph panel to Authority & Enforcement
- Add graph panel to Evidence
- Implement cross-highlighting between timeline and graph

### Phase 8: Global Search Expansion
- Expand search API
- Add grouped results by entity type

### Phase 9: Polish & Build
- Final design system pass
- Accessibility audit
- Build and deploy
