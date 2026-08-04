# FairProcess 2.0

> Evidence-first platform for property due-process analysis.

FairProcess combines property-centric GIS, an evidence vault, automatic timeline
generation, and automated detection of due-process discrepancies — all running
on Cloudflare's edge network.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Maps & GIS | MapLibre GL JS | Interactive parcel map with click-to-identify |
| Parcel Data | Humboldt County ArcGIS REST API | APN, zoning, acreage, legal description lookup |
| Edge Runtime | Cloudflare Workers (OpenNext) | Global low-latency API + SSR |
| Database | Cloudflare D1 (SQLite at edge) | Properties, projects, evidence, timeline, findings |
| Object Storage | Cloudflare R2 | Evidence documents (PDFs, images, notices) |
| Frontend | Next.js 15, Tailwind CSS, shadcn-style | Dark-mode dashboard UI |
| Analysis | TypeScript rule engine | Due-process analysis (notice timing, hearing rights, appeal pathway) |

### Why Cloudflare (not the original microservices stack)

The original design called for PostGIS, Neo4j, Temporal, Meilisearch, MinIO, and
a FastAPI backend. ADR-006 documents the pivot: for a single-county pilot, the
operational overhead of 7+ services wasn't justified. Cloudflare Workers + D1 + R2
gives us a globally distributed, zero-ops stack that scales to production without
managing containers. The Python code in `backend/` is frozen reference.

See `docs/architecture/adr.md` → ADR-006 for the full rationale.

## Quick Start

### Prerequisites

- Node.js 20+
- A Cloudflare account (free tier works)
- `npx wrangler login` (for D1 + R2 access)

### Local Development

```bash
cd frontend/web
npm install

# Create local D1 database + apply schema
npx wrangler d1 create fairprocess
npx wrangler d1 execute fairprocess --local --file=../../database/d1/schema.sql

# Create R2 bucket (skip if already done)
npx wrangler r2 bucket create fairprocess-evidence

# Run the dev server (wrangler, not next — needs D1/R2 bindings)
npx wrangler dev
```

> **Important:** Use `npx wrangler dev`, not `npx next dev`. The API routes
> depend on Cloudflare D1 and R2 bindings which only work through wrangler.
> Plain `next dev` won't have `env.DB` or `env.EVIDENCE_BUCKET`.

### Production Deploy

```bash
cd frontend/web
npm install

# Generate Cloudflare types from wrangler.toml
npx wrangler types --env-interface=CloudflareEnv cloudflare-env.d.ts

# Build with OpenNext for Cloudflare
npx next build
npx opennextjs-cloudflare build

# Deploy to Cloudflare Workers
npx wrangler deploy
```

### Remote Database (one-time setup)

```bash
# Create the remote D1 database
npx wrangler d1 create fairprocess
# → Copy the database_id into wrangler.toml

# Apply schema to remote
npx wrangler d1 execute fairprocess --remote --file=../../database/d1/schema.sql

# (If upgrading an existing database)
npx wrangler d1 execute fairprocess --remote --command "ALTER TABLE due_process_findings ADD COLUMN rule_name TEXT;"
```

## What's Built

### Map & Parcel Lookup
- Interactive MapLibre map centered on Humboldt County
- Click any parcel → popup with APN, address, zoning, acreage
- "Open as Project" button → resolve property by APN → create/select project

### Project Dashboard (`/project/[id]`)
- **Overview** — metrics (evidence count, findings, critical, timeline events),
  recent timeline, recent evidence, mini-map
- **Property Intelligence** — auto-gathered from county GIS on project creation
  (APN, zoning, general plan, acres, lot size, year built, coastal zone,
  flood zone, fire responsibility, legal description)
- **Timeline** — add custom events (notices, hearings, decisions, fines,
  deadlines), auto-sorted chronologically, adding events auto-triggers analysis
- **Building Dept** — permit tracking panel (UI shell, data pipeline TBD)
- **Code Enforcement** — case management panel (UI shell, data pipeline TBD)
- **Due Process Discrepancies** — findings with severity (critical/warning/info),
  status management (open/resolved/dismissed), manual "Run Analysis" button
- **Document Vault** — upload evidence to R2, auto-creates timeline events,
  auto-triggers analysis, text extraction for text-based files, download
- **Legal & Law Library** — 24 California legal references
- **Connectors & Skills** — integration panel (UI shell)
- **Admin** — project settings panel (UI shell)

### Due-Process Analyzer
Three rules, scored from 100 (−25 per critical, −10 per warning):

| Rule | Severity | Trigger |
|------|----------|---------|
| `notice_timing` | Warning | Action (fine/penalty/lien) taken < 10 days after notice |
| `hearing_right` | Critical | Adverse action without a recorded hearing |
| `appeal_pathway` | Warning | Decision doesn't mention appeal/review rights |
| `abatement_without_notice` | Critical | Property abated without notice or before compliance period |
| `permit_review_right` | Warning | Permit denied/expired without review opportunity |
| `ce_outcome_review` | Info | CE case closed without hearing or appeal on record |
| `appeal_pathway` | Warning | Decision without mention of appeal rights in linked evidence |

Analysis runs automatically when timeline events are added/removed and when
evidence is uploaded. Can also be triggered manually from the Discrepancies panel.

## Project Structure

```
fairprocessmaps/
├── frontend/web/           # Next.js app (deployed to Cloudflare Workers)
│   ├── src/
│   │   ├── app/            # App router — pages + API routes
│   │   │   ├── page.tsx     # Map home (search + parcel popup)
│   │   │   ├── project/[id] # Project dashboard
│   │   │   └── api/v1/      # API routes (D1 + R2)
│   │   ├── components/     # React components
│   │   │   ├── panels/     # Project dashboard panels
│   │   │   └── *.tsx       # Map, search, modals, etc.
│   │   └── lib/            # Shared logic
│   │       ├── auto-triggers.ts # Due-process analyzer (timeline + CE + permits) + intelligence
│   │       ├── api.ts      # Legacy API client (home page sidebar)
│   │       └── types.ts    # TypeScript types
│   ├── wrangler.toml      # Cloudflare config (D1, R2, vars)
│   └── cloudflare-env.d.ts # Generated types
├── database/d1/schema.sql  # D1 schema
├── docs/architecture/adr.md # Architecture Decision Records
├── backend/                # Frozen Python reference (not deployed)
└── INTEGRATION_NOTES.md    # What's wired vs. what's left
```

## API Reference

All endpoints are relative to the deployed worker URL.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/properties/resolve` | Find-or-create property by APN |
| GET | `/api/v1/properties/[id]/projects` | List projects for a property |
| POST | `/api/v1/properties/[id]/projects` | Create a project |
| GET | `/api/v1/projects?id=...` | Get project summary (joined data) |
| GET | `/api/v1/intelligence?projectId=...` | Gather county GIS data |
| GET | `/api/v1/evidence?projectId=...` | List evidence |
| POST | `/api/v1/evidence/upload` | Upload evidence to R2 |
| GET | `/api/v1/evidence/download?id=...` | Download evidence from R2 |
| DELETE | `/api/v1/evidence?id=...&projectId=...` | Delete evidence |
| GET | `/api/v1/timeline?projectId=...` | List timeline events |
| POST | `/api/v1/timeline?projectId=...` | Add timeline event |
| DELETE | `/api/v1/timeline?id=...&projectId=...` | Remove timeline event |
| GET | `/api/v1/findings?projectId=...` | List findings + score |
| POST | `/api/v1/findings?projectId=...` | Run analysis manually |
| PATCH | `/api/v1/findings?id=...&projectId=...` | Update finding status |
| GET | `/api/v1/permits?projectId=...` | List building permits |
| GET | `/api/v1/enforcement?projectId=...` | List code enforcement cases |
| POST | `/api/v1/analyze?projectId=...` | Run analysis (alias) |

## License

Proprietary — FairProcess 2.0
