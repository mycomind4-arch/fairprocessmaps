# FairProcess 2.0

> Evidence-first platform for property due-process analysis.

FairProcess combines property-centric GIS, continuous public-record ingestion, a persistent evidence vault, automatic timeline generation, AI extraction from notices and public records, and automated detection of potential due-process discrepancies.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| 1. Maps & GIS | MapLibre GL JS, React-Map-GL | Interactive property map |
| 2. Parcel Data | OpenAddresses, Overpass API | Parcel boundaries & addresses |
| 3. Spatial Database | PostGIS 3.7, pgvector | Permanent evidence store + spatial indexing |
| 4. Public Data Harvesting | CKAN, Socrata, Playwright | County record ingestion |
| 5. OCR & Documents | Tesseract, Docling, Marker | Notice → structured evidence |
| 6. Knowledge Graph | Neo4j 2026.06 | Evidence relationships |
| 7. Search | Meilisearch | Fast document search |
| 8. AI Framework | LangGraph, OpenAI | Long-running AI workflows |
| 9. Workflow Engine | Temporal | Durable process orchestration |
| 10. Evidence Storage | MinIO | S3-compatible object storage |
| 11. Timeline | vis-timeline | Interactive chronology |
| 12. Authentication | Supabase | Auth, DB, storage (planned) |
| 13. Edge Runtime | Cloudflare Workers | Global low-latency access (planned) |

## Quick Start

### Using Docker (recommended)

```bash
# 1. Clone
git clone https://github.com/mycomind4-arch/fairprocessmaps.git
cd fairprocessmaps

# 2. Copy env file and adjust API keys
cp .env.example .env

# 3. Start the full stack (PostGIS, Neo4j, Meilisearch, MinIO, Temporal, API, Web)
make dev

# 4. Open the app
open http://localhost:3000
#    API docs: http://localhost:8000/docs
#    Temporal UI: http://localhost:8233
#    Neo4j Browser: http://localhost:7474
#    MinIO Console: http://localhost:9001
```

### Manual setup

```bash
# Start infrastructure services only
docker compose -f infra/docker/docker-compose.yml up -d postgis neo4j meilisearch minio temporal

# Backend API
cd backend/api
uv sync
uv run uvicorn src.main:app --reload --port 8000

# Backend Worker
cd backend/workers
uv sync
uv run python -m src.main

# Frontend
cd frontend/web
pnpm install
pnpm dev
```

## Project Structure

```
fairprocessmaps/
├── backend/
│   ├── api/           # FastAPI REST gateway (properties, evidence, timeline, search, upload, due-process)
│   ├── workers/       # Temporal workflows + activities
│   ├── ai/            # LangGraph evidence graph, document extractors, due-process analyzer
│   └── ingestion/     # CKAN/Socrata harvesters, Playwright scrapers, record normalizers
├── database/
│   ├── postgis/       # SQL migrations, spatial functions, seeds
│   └── neo4j/         # Cypher schemas, graph migrations
├── frontend/
│   └── web/           # Next.js 15 + MapLibre + vis-timeline + Tailwind v4
├── shared/
│   └── types/         # Python shared types (TS mirror at frontend/web/src/lib/types.ts)
├── infra/
│   ├── docker/        # Docker Compose, Dockerfiles
│   └── terraform/     # Cloud infra (planned)
├── docs/
│   ├── architecture/  # ADRs
│   └── api/           # API documentation
├── tests/
│   ├── integration/   # Service integration tests
│   └── e2e/           # Playwright end-to-end tests
└── scripts/           # Migration runner, seed scripts, dev helper
```

## Core Concepts

### Property-Centric Evidence Model
Every piece of evidence is anchored to a `Property` (parcel/address). Evidence flows through:

1. **Ingestion** — scrape/OCR county records → raw document in MinIO
2. **Extraction** — LangGraph agents extract entities, dates, parties, violations
3. **Normalization** — map to canonical schema (notice type, jurisdiction, timeline)
4. **Graph Linking** — relate to property, parties, prior events in Neo4j
5. **Timeline Generation** — chronological events from extracted dates
6. **Due-Process Analysis** — rule engine checks for procedural gaps
7. **Indexing** — Meilisearch full-text index for fast search

### Due-Process Detection Rules

| Rule | Severity | Description |
|------|----------|-------------|
| Adequate Notice Period | Critical | Owner must receive notice ≥10 days before hearing/action |
| Right to Hearing | Critical | Owner must be offered a hearing before adverse action |
| Appeal Pathway Available | Warning | Decision must include information on how to appeal |
| Public Record Accessibility | Warning | Relevant records must be accessible via FOIA or public portal |
| Consistent Application | Info | Enforcement should be consistent with prior similar cases |

**Score:** `max(0, 100 - critical×25 - warning×10)`

### Supported Jurisdictions
- Oakland, CA
- Alameda County, CA
- Humboldt County, CA
- San Francisco, CA
- Los Angeles, CA

## Development

```bash
# Run all tests
make test

# Backend only
make test-backend    # pytest with coverage
make lint            # ruff + mypy

# Frontend only
make test-frontend   # vitest
make test-e2e        # playwright

# Format code
make format

# Clean everything
make clean
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/properties` | List properties (spatial + attribute filters) |
| GET | `/api/v1/properties/{id}` | Get property details |
| POST | `/api/v1/properties` | Create property |
| GET | `/api/v1/evidence` | List evidence (filter by property, type, status) |
| GET | `/api/v1/evidence/{id}` | Get evidence record |
| PATCH | `/api/v1/evidence/{id}` | Update evidence |
| GET | `/api/v1/timeline/{property_id}` | Get property timeline |
| GET | `/api/v1/search?q=...` | Full-text search |
| POST | `/api/v1/upload/property/{id}` | Upload document (multipart) |
| GET | `/api/v1/due-process/property/{id}` | Run due-process analysis |
| GET | `/health` | Health check |

Full interactive docs at `/docs` (Swagger UI) or `/redoc`.

## License

Apache-2.0
