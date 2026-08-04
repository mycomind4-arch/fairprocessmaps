# What's wired vs. what's left

This round edits the real files in place (not new copies) — diff these
against your repo and merge, don't just overwrite.

## Architecture pivot (ADR-006, 2026-08-04)

The microservices stack (FastAPI, PostGIS, Neo4j, Temporal, Meilisearch,
MinIO, LangGraph) described in ADRs 002–005 is **superseded**. The
production stack is now:

- **Next.js API routes** (`frontend/web/src/app/api/v1/*`) on Cloudflare Workers
- **Cloudflare D1** (SQLite at edge) — schema in `database/d1/schema.sql`
- **Cloudflare R2** (S3-compatible object storage for uploaded evidence)
- **Agent-triggered workflows** (Base44) for durable orchestration
- **Humboldt County ArcGIS REST API** for parcel lookup/identification

The Python code in `backend/` is frozen reference — not deployed.
See `docs/architecture/adr.md` ADR-006 for the full rationale.

## Fully wired end-to-end
- Map click → parcel popup → **Open as project** button (`PropertyMap.tsx`)
- Button → `POST /api/v1/properties/resolve` (find-or-create Property by APN)
- → `NewProjectModal` shows existing projects for that property, or a
  create form (`GET`/`POST /api/v1/properties/[id]/projects`)
- → creating/selecting a project routes to `/project/[id]`
- Dashboard header + mini-map + nav badge read from
  `GET /api/v1/projects/[id]`, which joins property + open/critical
  finding counts
- Dashboard panels (Timeline, Evidence Vault, Discrepancies, Overview,
  Building Dept, Code Enforcement, Legal Library, Connectors, Admin)
  all fetch by `projectId` — ✅ done
- Humboldt County parcel click-to-identify on the map — ✅ done

## D1 database — ✅ done
- Database `fairprocess` (`8b5ed716-77c3-48d2-81c1-009cb01b206f`) exists remotely
- Schema applied: `properties`, `projects`, `evidence`, `evidence_relations`,
  `timeline_events`, `due_process_findings`, `building_permits`,
  `code_enforcement_cases`
- `wrangler.toml` has the real `database_id` — no placeholder

## Due-process analyzer — ✅ done (ported)
- Python rule engine in `backend/api/src/services/due_process_analyzer.py`
  ported to TypeScript at `frontend/web/src/app/api/v1/analyze/route.ts`
- Rules: notice timing, hearing right, appeal pathway, record access,
  consistent application
- `POST /api/v1/analyze?projectId=...` → runs rules against evidence +
  timeline, writes `due_process_findings`, updates `projects.due_process_score`
- `GET /api/v1/analyze?projectId=...` → returns current findings + score

## Property Intelligence — ✅ done (initial)
- `POST /api/v1/intelligence?projectId=...` → queries Humboldt County
  GIS by APN, enriches the property record, creates `ai_research`
  evidence + timeline event
- Pulls: APN, address, zoning, general plan, acres, lot size, year built,
  coastal zone, flood zone, fire responsibility, supervisor district,
  legal description, transfer date
- Does NOT yet: scrape county websites for enforcement history, pull
  permits/inspections, cross-reference prior cases

## Still open
1. **Local dev needs a D1 binding** — either run `wrangler dev` (not
   `next dev`) so `getCloudflareContext()` resolves, or add a dev shim.
   Plain `next dev` won't have `env.DB` available.

2. **R2 binding for evidence uploads** — `evidence/upload/route.ts`
   references R2 but the R2 bucket isn't bound in `wrangler.toml` yet.
   Need to add `[[r2_buckets]]` binding.

3. **Trigger analysis automatically** — the due-process analyzer is
   available via `POST /api/v1/analyze` but nothing triggers it
   automatically on evidence upload or project creation. Should be
   wired as a workflow or called from the upload route.

4. **Trigger intelligence automatically** — same: the intelligence
   endpoint exists but isn't auto-triggered on project creation. Should
   fire when a new project is created via `POST /api/v1/projects`.

5. **The old README still describes the microservices stack** — it
   should be updated to reflect the Cloudflare D1/Workers architecture,
   or at minimum point to ADR-006.
