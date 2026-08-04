# Architecture Decision Records

## ADR-001: Evidence-Anchored Data Model
**Date:** 2026-08-03
**Status:** Accepted

Every piece of evidence is anchored to a `Property` entity. This ensures traceability — all documents, timeline events, and due-process analyses can be traced back to a specific parcel.

## ADR-002: LangGraph for AI Pipeline
**Date:** 2026-08-03
**Status:** Superseded by ADR-006

We use LangGraph for the evidence extraction pipeline because it supports stateful, multi-step AI workflows with branching and error recovery. The graph structure maps directly to our ingestion pipeline: OCR → Extract → Normalize → Link → Timeline → Analyze → Index.

## ADR-003: PostGIS + pgvector for Spatial + Semantic Search
**Date:** 2026-08-03
**Status:** Superseded by ADR-006

PostGIS provides spatial indexing (GIST) for parcel boundary queries. pgvector extends Postgres with vector embeddings for semantic search of evidence documents, avoiding the need for a separate vector database.

## ADR-004: Temporal for Durable Workflows
**Date:** 2026-08-03
**Status:** Superseded by ADR-006

Document ingestion is long-running (OCR + LLM calls can take minutes). Temporal provides durability, retries, and visibility for these workflows — if a worker crashes mid-processing, the workflow resumes from the last completed activity.

## ADR-005: Dual Search — Meilisearch + PostGIS
**Date:** 2026-08-03
**Status:** Superseded by ADR-006

Meilisearch handles fast full-text search across evidence documents. PostGIS handles spatial queries (properties within radius, within county). The search API merges results from both for hybrid queries.

## ADR-006: Pivot to Cloudflare D1 + Workers (Lean Stack)
**Date:** 2026-08-04
**Status:** Accepted

### Context

ADRs 002–005 describe an ambitious microservices architecture: FastAPI + PostGIS/pgvector + Neo4j + Temporal + Meilisearch + MinIO + LangGraph, orchestrated via Docker Compose. While architecturally sound, this stack has a high operational burden for the current stage:

- Five separate services to deploy, monitor, and scale (API, workers, Postgres, Neo4j, Meilisearch).
- Python backend requiring its own CI/CD, dependency management, and container pipeline.
- No managed PostGIS/pgvector offering in our deployment target (Cloudflare).
- The application is currently single-county (Humboldt) with modest data volume — the full distributed stack is overkill.

Meanwhile, the frontend was already built as a Next.js app deployed to Cloudflare Workers via OpenNext. Cloudflare D1 (SQLite at the edge) and R2 (S3-compatible object storage) cover the same data and storage needs at a fraction of the operational cost.

### Decision

**Replace the microservices stack with a single-tier Cloudflare architecture:**

| Old Stack (ADR 002–005) | New Stack (ADR-006) |
|---|---|
| FastAPI + Uvicorn | Next.js API routes (`/api/v1/*`) on Workers |
| PostgreSQL + PostGIS | Cloudflare D1 (SQLite at edge) |
| pgvector embeddings | Not needed yet — D1 full-text + keyword search |
| Neo4j graph DB | `evidence_relations` relational table in D1 |
| Temporal workflows | Agent-triggered workflows (Base44) |
| Meilisearch | D1 `LIKE` + future D1 FTS5 |
| MinIO object storage | Cloudflare R2 (S3-compatible) |
| LangGraph pipeline | Agent-step orchestration (Base44 workflows) |
| Python due-process analyzer | TypeScript rule engine in API route |

The `backend/` Python directory and `database/postgis/` + `database/neo4j/` migrations are retained as reference implementations for the rule engine and data model, but are **not deployed**. All production code lives in `frontend/web/`.

### Consequences

- **Single deployment target:** Everything runs on Cloudflare Workers + D1 + R2.
- **Lower latency:** D1 is at the edge, not a remote Postgres instance.
- **Simpler CI/CD:** One `wrangler deploy` command.
- **Type-safe full-stack:** Frontend and API share the same TypeScript types.
- **Trade-off:** We lose PostGIS spatial queries (parcel-in-radius), but MapLibre handles spatial rendering client-side, and the Humboldt County ArcGIS REST API handles server-side parcel lookup. We also lose pgvector semantic search — acceptable until evidence volume justifies adding it back (likely as a Cloudflare Vectorize binding).
- **The Python code in `backend/` is frozen, not deleted.** It serves as the reference for porting logic (especially the due-process rule engine) into TypeScript.

### Data Model (D1)

The D1 schema (`database/d1/schema.sql`) preserves the same core entities from ADR-001, with one structural change: evidence now hangs off `project_id` (not `property_id`), since a parcel can have multiple enforcement cases over time.

- `properties` — one row per APN (immutable parcel identity)
- `projects` — a specific enforcement/permitting matter on a property
- `evidence` — documents, anchored to a project
- `timeline_events` — extracted/recorded events, anchored to a project
- `due_process_findings` — rule-engine output, anchored to a project
- `evidence_relations` — relational graph (supersedes / references / responds_to / contradicts)
