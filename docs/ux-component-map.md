# FairProcessMaps — Component & Data Mapping

## Current Component Inventory

### Panels (src/components/panels/)
| Component | Lines | Used By | Status |
|-----------|-------|---------|--------|
| OverviewPanel.tsx | 254 | CaseIntelligencePanel | DELETE — redundant with PropertyIntelligence |
| CaseIntelligencePanel.tsx | 69 | project/[id]/page.tsx | DELETE — sub-tab wrapper for Overview + PropertyIntelligence |
| PropertyIntelligence.tsx | 254 | CaseIntelligencePanel | MAJOR REWRITE — becomes primary landing |
| BuildingDeptPanel.tsx | 792 | AuthorityEnforcementPanel | DELETE — merge into AuthorityEnforcementPanel |
| CodeEnforcementPanel.tsx | 818 | AuthorityEnforcementPanel (x2) | DELETE — merge into AuthorityEnforcementPanel |
| AuthorityEnforcementPanel.tsx | 195 | project/[id]/page.tsx | MAJOR REWRITE — unified authority + enforcement |
| TimelinePanel.tsx | 341 | project/[id]/page.tsx | MAJOR REWRITE — multi-mode timeline |
| EventReconstruction.tsx | 373 | TimelinePanel | INTEGRATE — becomes "Episodes" mode |
| ProceduralClock.tsx | 317 | TimelinePanel | INTEGRATE — becomes deadline overlay |
| EvidenceVaultPanel.tsx | 269 | project/[id]/page.tsx | ENHANCE — add provenance, connections |
| LegalAnalysisPanel.tsx | 59 | project/[id]/page.tsx | RESTRUCTURE — becomes "Analysis" |
| DiscrepanciesPanel.tsx | 412 | LegalAnalysisPanel | ENHANCE — add FACT/POTENTIAL ISSUE/LEGAL CONCLUSION labels |
| DefenseBuilderPanel.tsx | 365 | project/[id]/page.tsx | INTEGRATE — becomes Analysis sub-section |
| LegalLibraryPanel.tsx | 269 | LegalAnalysisPanel | KEEP — Analysis sub-section |
| BriefGeneratorPanel.tsx | 315 | LegalAnalysisPanel | KEEP — Analysis sub-section |
| ConnectorsPanel.tsx | 329 | project/[id]/page.tsx | KEEP — demote to secondary nav |
| AdminPanel.tsx | 587 | project/[id]/page.tsx | KEEP — demote to secondary nav |
| InvestigationFeed.tsx | 188 | (unused in project page) | REVIEW — may feed AI Review |
| PlaceholderPanel.tsx | 36 | (unused) | DELETE |
| AIReviewPanel.tsx | NEW | project/[id]/page.tsx | CREATE — AI review workspace |

### Core Components (src/components/)
| Component | Status |
|-----------|--------|
| ProjectNav.tsx | REWRITE — new 6-item nav structure |
| InvestigationGraph.tsx | MODIFY — make embeddable variants |
| TimelineList.tsx | KEEP — used in graph section |
| DetailPanel.tsx | KEEP — used in graph section |
| SearchBar.tsx | ENHANCE — expand search scope |
| PropertyMap.tsx | KEEP |
| MiniMap.tsx | KEEP |
| DocumentUpload.tsx | KEEP |
| LoginModal.tsx | KEEP |
| NewProjectModal.tsx | KEEP |
| ScoreRing.tsx | KEEP |
| DueProcessBadge.tsx | KEEP |
| AutoSaveIndicator.tsx | KEEP |
| AgentAnalysisBanner.tsx | KEEP |
| EvidencePanel.tsx | REVIEW — may be unused/duplicate |
| TimelinePanel.tsx (component) | REVIEW — duplicate with panels/TimelinePanel |

### Pages
| Page | Status |
|------|--------|
| app/page.tsx (landing) | KEEP |
| app/dashboard/page.tsx | KEEP |
| app/project/[id]/page.tsx | MAJOR REWRITE — new section wiring |
| app/map/page.tsx | KEEP |
| app/investigation/[id]/page.tsx | REVIEW — fullscreen graph view |
| app/admin/page.tsx | KEEP |

---

## Data Flow Mapping

### Property Intelligence (Primary Landing)
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Address, APN, parcel | /api/v1/properties | ✓ |
| Owner, zoning, acres | /api/v1/intelligence/data | ✓ |
| Project name, status, case type | /api/v1/projects | ✓ |
| Evidence count, findings count, timeline count | /api/v1/overview | ✓ |
| Critical findings count | /api/v1/overview | ✓ |
| Recent evidence | /api/v1/overview | ✓ |
| Recent timeline events | /api/v1/overview | ✓ |
| Due process score | /api/v1/overview | ✓ |
| Investigation brief (situation/known/uncertain) | NEW — derive from findings + evidence | Client-side |
| Needs attention items | NEW — derive from findings, missing_info, anomalies | Client-side |
| Agencies involved | /api/v1/enforcement | ✓ |
| Building permits | /api/v1/permits | ✓ |
| Enforcement cases | /api/v1/enforcement | ✓ |
| People involved | BACKEND REQUIRED — no people table | ✗ |

### Authority & Enforcement
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Code enforcement cases | /api/v1/enforcement | ✓ |
| Building permits | /api/v1/permits | ✓ |
| Chain of authority | STATIC PLACEHOLDER | ✗ — needs authority_chains table |
| Position holders (current) | BACKEND REQUIRED | ✗ — needs position_holders table |
| Position holders (historical) | BACKEND REQUIRED | ✗ — needs position_holders table |
| Action → actor mapping | BACKEND REQUIRED | ✗ — no actor data on actions |
| Authority source documents | /api/v1/evidence | ✓ (if linked) |

### Timeline
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Timeline events | /api/v1/timeline | ✓ |
| Event → evidence link | /api/v1/timeline (evidence_id) | ✓ |
| Findings (anomalies) | /api/v1/findings | ✓ |
| Episode grouping | CLIENT-SIDE | Derive from event_type sequences |
| Temporal authority | BACKEND REQUIRED | ✗ — needs position_holders |
| Event actor/position | BACKEND REQUIRED | ✗ — no actor data on events |

### Evidence
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Evidence list | /api/v1/evidence | ✓ |
| Evidence upload/withdraw | /api/v1/evidence/upload, /withdraw | ✓ |
| Evidence download | /api/v1/evidence/download | ✓ |
| Related events | /api/v1/timeline (filter by evidence_id) | ✓ |
| Related findings | /api/v1/findings (filter by evidence_id) | ✓ |
| Provenance/source | evidence.source field | ✓ |

### Analysis
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Findings | /api/v1/findings | ✓ |
| Statutes | /lib/statutes.ts (static) | ✓ |
| Legal references | /lib/legal-data.ts (static) | ✓ |
| Defense arguments | CLIENT-SIDE (from findings) | ✓ |
| Generated briefs | /api/v1/cases/[id]/brief | ✓ |

### AI Review
| Data Field | Source API | Available? |
|------------|-----------|------------|
| Agent proposals | /api/v1/cases/[id]/agents/proposals | ✓ |
| Agent runs | /api/v1/cases/[id]/agents/run | ✓ |
| Findings with missing_info | /api/v1/findings | ✓ |
| Agent feedback | /api/v1/agents/proposals/[id]/review | ✓ |
| AI observations | BACKEND REQUIRED | Partial — in agent_runs.data |

---

## New Navigation Structure

```
PRIMARY (Investigation)
├── Property Intelligence    (intelligence)
├── Authority & Enforcement  (authority)
├── Timeline                 (timeline)
├── Evidence                 (vault)
├── Analysis                (analysis)
└── AI Review               (ai-review)

SECONDARY (System)
├── Connectors              (connectors)
└── Admin                   (admin)
```

### ProjectSection Type Changes

Old:
```typescript
type ProjectSection = "intelligence" | "timeline" | "authority" | "vault" | "legal" | "defense-builder" | "connectors" | "admin" | "graph"
```

New:
```typescript
type ProjectSection = "intelligence" | "authority" | "timeline" | "vault" | "analysis" | "ai-review" | "connectors" | "admin"
```

Removed: "graph" (integrated), "legal" (becomes "analysis"), "defense-builder" (merged into analysis)
Added: "analysis", "ai-review"

---

## Component Dependency Graph (New)

```
project/[id]/page.tsx
├── ProjectNav (new 6-item structure)
├── PropertyIntelligence (enhanced, primary landing)
│   ├── InvestigationBrief (new)
│   ├── NeedsAttention (new)
│   └── PropertyIdentity + Intel (existing, enhanced)
├── AuthorityEnforcementPanel (rewritten)
│   ├── OrganizationView (new)
│   ├── ActionView (new)
│   └── EnforcementDataList (merged from BuildingDept + CodeEnforcement)
├── TimelinePanel (rewritten)
│   ├── ChronologicalMode (existing)
│   ├── EpisodesMode (from EventReconstruction)
│   ├── EvidenceMode (new)
│   ├── AuthorityMode (new)
│   ├── TimelineControls (new)
│   ├── TimelineDetailPanel (enhanced)
│   └── ProceduralClock (integrated)
├── EvidenceVaultPanel (enhanced)
│   ├── EvidenceList (existing)
│   ├── ProvenanceDisplay (new)
│   └── RelatedObjectsPanel (new)
├── LegalAnalysisPanel → AnalysisPanel (restructured)
│   ├── DiscrepanciesPanel (enhanced with FACT/ISSUE/CONCLUSION labels)
│   ├── DefenseBuilderPanel (integrated)
│   ├── LegalLibraryPanel (existing)
│   └── BriefGeneratorPanel (existing)
├── AIReviewPanel (new)
│   ├── ProposalList (new)
│   ├── ObservationList (new)
│   ├── AnomalyList (new)
│   └── HumanReviewActions (new)
├── ConnectorsPanel (demoted to secondary)
└── AdminPanel (demoted to secondary)
```

---

## Backend Requirements Summary

| Requirement | Table/API Needed | Priority |
|-------------|------------------|----------|
| Position holders | position_holders table + API | Phase 3 (Authority) |
| Authority chains | authority_chains table + API | Phase 3 (Authority) |
| Episode grouping | Client-side algorithm or API | Phase 4 (Timeline) |
| Timeline anomalies | Client-side from findings | Phase 4 (Timeline) |
| AI Review aggregation | Extend agents API | Phase 6 (AI Review) |
| Global search expansion | Expand /api/v1/search | Phase 8 (Search) |
