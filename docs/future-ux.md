# FairProcess — Ideal Future UX

**Date:** August 7, 2026
**Status:** Recommendation (not yet implemented)

---

## Overview

This document describes the ideal user experience for FairProcess. It builds on the existing dark-mode design language while solving the core UX problems: two disconnected investigation views, missing error/empty states, no agent review UI, and no guided workflows.

---

## Design Principles

1. **One investigation, one URL.** No duplicate pages. The investigation page is the core experience.
2. **Always answer four questions:** What am I looking at? Why does it matter? What evidence supports it? What should I do next?
3. **Evidence is one click away** from every timeline event, finding, and relationship.
4. **AI proposals are visible inline** — not hidden in a separate tab.
5. **Timeline is the default view** — it's the most intuitive way to understand a case.
6. **Every action has feedback** — loading states, success confirmations, error messages.
7. **Empty states guide the user** — "Add your first evidence document" not just blank space.
8. **Professional, not flashy** — calm dark-mode, restrained color, one accent color.

---

## Four Primary Surfaces

### 1. Dashboard

**Purpose:** Overview of all investigations + jurisdiction monitoring
**Primary action:** Open an investigation or start a new one

```
┌─────────────────────────────────────────────────────────┐
│ FairProcess                                    [Sign Out]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ Active   │ │ Critical│ │ Pending │ │ Evidence│        │
│  │   12     │ │    3    │ │    7    │ │  847    │        │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│                                                         │
│  Recent Investigations                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 123 Main St · APN 123-456  · Score: 65 · 3 finds │   │
│  │ 456 Oak Ave · APN 456-789  · Score: 90 · 1 find  │   │
│  │ 789 Pine Rd · APN 789-012  · Score: 45 · 5 finds │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Pending Reviews                                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ⚠️ Timeline Anomaly: 3 proposals pending review   │   │
│  │ 📋 Statute Matcher: 2 proposals pending review   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [New Investigation]  [View Map]                        │
└─────────────────────────────────────────────────────────┘
```

**Key components:**
- Summary stat tiles (active investigations, critical findings, pending reviews, evidence count)
- Recent investigations list with scores and finding counts
- Pending reviews section (agent proposals awaiting human review)
- Primary actions: New Investigation (→ map), View Map

**Empty state:** "No investigations yet. Search for a property on the map to start your first investigation."

**AI opportunities:**
- "3 investigations need attention" (prioritized by severity)
- "Recon completed for 2 properties since you last visited"

**What to remove:** None — this is a new unified dashboard replacing the current one.

**What to add:** Pending reviews section, search/filter on investigation list, empty state guidance.

---

### 2. Investigation (Core Experience)

**Purpose:** Understand and investigate a single property case
**Primary action:** Review evidence, check timeline, examine findings, review AI proposals

```
┌─────────────────────────────────────────────────────────┐
│ ← Back   123 Main St, Eureka   · APN 123-456-789       │
│          Open · Humboldt County · Score: 65 [Run Agent] │
├─────────────────────────────────────────────────────────┤
│ [Timeline] [Graph] [Evidence] [Findings] [AI Review]    │
├─────────────────────────────────┬───────────────────────┤
│                                 │                       │
│  TIMELINE                       │  CONTEXT PANEL        │
│                                 │                       │
│  ┌─ 2026-01-15 ──────────────┐ │  Selected: Notice     │
│  │ 📎 Notice of Violation     │ │  of Violation         │
│  │    Served to property owner│ │                       │
│  │    Source: Upload          │ │  Evidence:            │
│  └────────────────────────────┘ │  [View Document]      │
│                                 │                       │
│  ┌─ 2026-01-20 ──────────────┐ │  AI Analysis:         │
│  │ 🏛️ Hearing Scheduled      │ │  ⚠️ Timeline Anomaly: │
│  │    5 days after notice ⚠️ │ │  Only 5 days between  │
│  │    Source: County Records │ │  notice and hearing.  │
│  └────────────────────────────┘ │  Required: 10 days.  │
│                                 │                       │
│  ┌─ 2026-01-25 ──────────────┐ │  [Accept] [Reject]    │
│  │ 📎 Decision Rendered       │ │                       │
│  │    Fine: $5,000            │ │  Relationships:        │
│  │    Source: Upload          │ │  → mandated_by: HCC   │
│  └────────────────────────────┘ │    § 12.04.030       │
│                                 │  [pending review]     │
│  [+ Add Event]                  │                       │
│                                 │                       │
├─────────────────────────────────┴───────────────────────┤
│ Agent Activity: [Timeline Anomaly ✅] [Statute Matcher ✅]│
│ 3 pending proposals · Last run: 2 hours ago             │
└─────────────────────────────────────────────────────────┘
```

**Tabs:**

#### Timeline Tab (Default)
- Chronological list of events
- Each event shows: date, type, description, source badge, evidence link
- Anomaly markers (⚠️) on events flagged by agents
- Source badges: 📎 evidence, 🏛️ government, 🤖 AI, ✏️ manual
- Confidence indicators for AI-proposed events
- Add event button
- Filtering: by type, by actor, by date range
- Expand/collapse for grouped events

#### Graph Tab
- Interactive node-link diagram
- Node types with distinct visual styles (not colors — shapes or icons)
- Edge types with labels
- Pending_review edges dashed, accepted edges solid
- Click node → context panel shows explanation ("Why am I seeing this?")
- Legend explaining node/edge types
- Filter by node type
- Temporal slider (show graph as of date X)

#### Evidence Tab
- Grid/list of evidence documents
- Each card: title, type, source, hash, upload date, status
- AI extraction summary (when available)
- Upload button
- Filter by type, source, status
- Search within evidence content (when implemented)
- Withdraw action (with provenance)

#### Findings Tab
- List of due-process findings
- Each finding: rule name, severity badge, status, detail, evidence link
- Severity: critical (red), warning (amber), info (blue)
- Status: open, resolved, dismissed
- Run Analysis button
- Resolve/Dismiss actions
- Finding fingerprint indicator (shows if this is a new or persistent finding)

#### AI Review Tab
- Pending agent proposals
- Grouped by agent type
- Each proposal: type, description, confidence, evidence links, reasoning trace
- Accept/Reject buttons with reason field
- Agent feedback stats (acceptance rate per agent)
- Run agent buttons (Timeline Anomaly, Statute Matcher, etc.)

**Context Panel (Right Side):**
- Shows details of selected item (event, node, evidence, finding, proposal)
- Evidence preview (when linked)
- Provenance (who created it, when, how)
- AI analysis (agent observations about this item)
- Relationships (connected entities)
- Review actions (accept/reject for proposals, resolve/dismiss for findings)

**Agent Activity Bar (Bottom):**
- Status of each agent (last run, result)
- Pending proposal count
- Run agent buttons
- "Last run: X hours ago" indicator

**Empty states:**
- No timeline events: "Add your first event or upload evidence to start building the timeline"
- No evidence: "Upload your first document — notices, decisions, permits, or any relevant records"
- No findings: "Run analysis to detect due-process discrepancies"
- No proposals: "Run an agent to generate AI proposals for review"

**Loading states:**
- Skeleton loaders for panels (not spinners)
- Progress indicator for recon: "Running property intelligence recon... 8/12 agents complete"

**Error states:**
- "Failed to load timeline. [Retry]"
- "Recon failed for 3 agents. [View details] [Re-run]"

---

### 3. Map

**Purpose:** Discover properties and start investigations
**Primary action:** Click a parcel to view details and open as investigation

```
┌─────────────────────────────────────────────────────────┐
│ [Search: address, APN, owner...]        [Filters] [⊕]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    MAPLIBRE MAP                          │
│                                                         │
│         ● 123 Main St (Score: 65)                       │
│              ● 456 Oak Ave (Score: 90)                   │
│                   ● 789 Pine Rd (Score: 45)             │
│                                                         │
│  [Color legend: Green >80, Yellow 60-80, Red <60]      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Popup: 123 Main St · APN 123-456-789                  │
│ Zoning: Rural Residential · 2.5 acres                   │
│ Score: 65 (3 findings, 2 critical)                      │
│ [Open Investigation]                                    │
└─────────────────────────────────────────────────────────┘
```

**Key components:**
- Full-screen MapLibre map
- Search bar (address, APN, owner)
- Property markers for properties with investigations (color-coded by score)
- Click any parcel → popup with property details
- "Open Investigation" button
- Color legend for scores

**Future:**
- Heat map showing jurisdiction-wide due-process score distribution
- Filter by score range, finding type, jurisdiction
- Cluster view for zoomed-out (multiple properties in one marker)

---

### 4. Settings

**Purpose:** Organization management, jurisdiction connectors, agent configuration
**Primary action:** Configure the platform

**Sub-pages:**

#### Organization
- Organization name, slug, type
- Members list with roles
- Invite member
- Change member role

#### Jurisdictions
- List of configured jurisdictions
- Add jurisdiction (adapter configuration)
- Per-jurisdiction: data source URLs, statute library, procedural rules

#### Agents
- List of registered agents
- Per-agent: status (enabled/disabled), model version, last run
- Agent feedback stats (acceptance rate, proposal count)
- Configure agent schedule (for monitoring agents)

#### Users
- List of users with roles
- Deactivate/reactivate users
- View user activity (audit log)

---

## Visual Design

### Color Palette (Keep Existing)

```
--fp-bg:        Dark background
--fp-surface:   Card surface
--fp-surface-2: Elevated surface
--fp-text:      Primary text
--fp-text-muted: Secondary text
--fp-text-dim:  Tertiary text
--fp-border:    Border color
--fp-blue:      Primary accent
--fp-cyan:      Secondary accent
--fp-green:     Success
--fp-amber:     Warning
--fp-red:       Error/critical
```

### Typography (Keep Existing)

- WixMadefor (set by host)
- Font sizes: 2xl (headings), base (body), sm (secondary), xs (labels)

### Component Patterns

- **Stat tile:** `rounded-lg border bg-card p-6` with label, value, and optional delta
- **List item:** `rounded-lg border p-4 hover:bg-accent` with title, subtitle, and badge
- **Badge:** `rounded-full px-2 py-0.5 text-xs font-medium` with semantic color
- **Button:** `rounded-md px-4 py-2 text-sm font-medium` with variant (primary, secondary, ghost, destructive)
- **Panel:** `rounded-lg border bg-card p-6`
- **Empty state:** Centered with icon, message, and CTA button

### Semantic Colors

- **Critical/Red:** Error states, critical findings, destructive actions
- **Warning/Amber:** Warnings, pending items, attention needed
- **Success/Green:** Success, resolved findings, completed recon
- **Info/Blue:** Information, AI proposals, agent activity
- **Neutral:** All other text, surfaces, borders

---

## Accessibility

### Required Improvements

1. **ARIA labels** on all icon-only buttons (`aria-label="Run analysis"`)
2. **Focus visible** states (`focus-visible:ring-2 focus-visible:ring-ring`)
3. **Semantic HTML:** `<nav>`, `<main>`, `<section>`, `<article>`
4. **Form labels:** `<label>` for every input, not just placeholders
5. **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables animations
6. **Keyboard navigation:** Tab order follows visual order, Escape closes modals
7. **Screen reader:** `role="status"` for loading states, `role="alert"` for errors
8. **Contrast:** Ensure all text meets WCAG AA (4.5:1) against backgrounds

---

## Interaction Design

### Evidence Upload Flow

1. User clicks "Upload Evidence" in Evidence tab
2. File picker opens (or drag-and-drop zone)
3. File selected → validation (size, type, filename sanitization)
4. Upload progress indicator
5. Upload complete → evidence card appears in list
6. Timeline event auto-created → appears in timeline
7. Analysis auto-triggered → findings update (with notification if new findings)
8. Toast notification: "Evidence uploaded. Analysis updated: 2 new findings."

### Agent Run Flow

1. User clicks "Run Agent" in agent activity bar
2. Agent selection dropdown (Timeline Anomaly, Statute Matcher, etc.)
3. Agent runs → progress indicator in activity bar
4. Complete → proposals appear in AI Review tab
5. Toast: "Timeline Anomaly: 3 new proposals pending review"
6. Badge counter updates on AI Review tab

### Proposal Review Flow

1. User opens AI Review tab
2. Sees pending proposals grouped by agent
3. Clicks a proposal → context panel shows details
4. Reviews: description, confidence, evidence links, reasoning trace
5. Clicks Accept or Reject (with optional reason)
6. If relationship proposal accepted → relationship created with pending_review status
7. Toast: "Proposal accepted. Relationship created — pending second review."
8. Proposal moves to "Reviewed" section

### Investigation Creation Flow

1. User goes to Map
2. Searches for address or clicks parcel
3. Popup shows property details
4. Clicks "Open Investigation"
5. Property resolved (or created) by APN
6. Investigation created → redirect to investigation page
7. Recon auto-runs (first time only) → intelligence gathers
8. Timeline starts with "Investigation created" event

---

## What Should Be Removed

1. `/project/%5Bid%5D/page.tsx` — duplicate route
2. `/project/[id]/page.tsx` — merged into unified investigation page
3. `/investigation/[id]/page.tsx` — merged into unified investigation page
4. All panel shells with no data (Building Dept, Code Enforcement, Connectors, Admin) — replaced with functional implementations or removed until ready
5. Silent error handling (`catch { // Silently fail }`) — replaced with visible error states
6. Recon auto-run on every page load — only on first visit or explicit trigger

---

## What Should Be Added

1. **Unified investigation page** — merges project dashboard + investigation view
2. **Agent proposal review UI** — in the investigation page, not a separate route
3. **Pending reviews on dashboard** — shows proposals awaiting human review
4. **Empty states with guidance** — every panel, every page
5. **Error states with retry** — every data fetch
6. **Loading skeletons** — not spinners
7. **Toast notifications** — for every async action result
8. **Keyboard shortcuts** — e.g., "E" to add evidence, "T" to add timeline event
9. **Search within investigation** — find evidence, events, findings by text
10. **"What changed since last visit"** — diff of new evidence, events, findings, proposals
