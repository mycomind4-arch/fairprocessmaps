# FairProcess 2.0

> Evidence-first platform for property due-process analysis.

FairProcess combines property-centric GIS, continuous public-record ingestion, a persistent evidence vault, automatic timeline generation, AI extraction from notices and public records, and automated detection of potential due-process discrepancies.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| 1. Maps & GIS | MapLibre GL JS, GeoLibre | Interactive property map |
| 2. Parcel Data | OpenAddresses, Overpass API | Parcel boundaries & addresses |
| 3. Spatial Database | PostGIS 3.7, pgvector, DuckDB | Permanent evidence store |
| 4. Public Data Harvesting | CKAN, Socrata, Scrapy, Playwright | County record ingestion |
| 5. OCR & Documents | Tesseract, Docling, Marker | Notice → structured evidence |
| 6. Knowledge Graph | Neo4j 2026.06 | Evidence relationships |
| 7. Search | Meilisearch | Fast document search |
| 8. AI Framework | LangGraph, PydanticAI | Long-running AI workflows |
| 9. Workflow Engine | Temporal, n8n | Durable process orchestration |
| 10. Evidence Storage | MinIO | S3-compatible object storage |
| 11. Timeline | vis-timeline, React Flow | Interactive chronology |
| 12. Authentication | Supabase | Auth, DB, storage |
| 13. Edge Runtime | Cloudflare Workers | Global low-latency access |

## Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/yourorg/fairprocessmaps.git
cd fairprocessmaps

# 2. Start the full stack
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Run migrations
./scripts/migrate.sh

# 4. Seed sample data
./scripts/seed.sh

# 5. Open the app
open http://localhost:3000
```

## Project Structure

```
fairprocessmaps/
├── backend/
│   ├── api/           # FastAPI REST + GraphQL gateway
│   ├── workers/       # Temporal workflows + task queues
│   ├── ai/            # LangGraph agents, extractors, due-process analysis
│   └── ingestion/     # County scrapers, OCR pipeline, normalizers
├── database/
│   ├── postgis/       # Migrations, spatial functions, seeds
│   └── neo4j/         # Cypher schemas, graph migrations
├── frontend/
│   └── web/           # Next.js + MapLibre + vis-timeline
├── shared/
│   ├── types/         # TypeScript + Python shared types
│   └── schemas/       # JSON Schema, OpenAPI, Pydantic models
├── infra/
│   ├── docker/        # Docker Compose, Dockerfiles
│   └── terraform/     # Cloud infra (AWS/GCP/Cloudflare)
├── docs/
│   ├── architecture/  # ADRs, layer docs
│   └── api/           # API documentation
└── tests/
    ├── integration/   # Service integration tests
    └── e2e/           # Playwright end-to-end tests
```

## Core Concepts

### Property-Centric Evidence Model
Every piece of evidence is anchored to a `Property` (parcel/address). Evidence flows through:

1. **Ingestion** — scrape/OCR county records → raw document
2. **Extraction** — AI agents extract entities, dates, parties, violations
3. **Normalization** — map to canonical schema (notice type, jurisdiction, timeline)
4. **Graph Linking** — relate to property, parties, prior events in Neo4j
5. **Due-Process Analysis** — LangGraph agent checks for procedural gaps
6. **Timeline Generation** — chronological visualization with discrepancy flags

### Due-Process Detection Rules
- Was proper notice given? (time, method, content)
- Was a hearing offered? (right to contest)
- Was the decision appealable? (pathways, deadlines)
- Were records accessible? (FOIA/ public data availability)
- Was the process consistent with prior similar cases?

## Development

```bash
# Install dependencies
pnpm install          # frontend
uv sync               # backend (Python)

# Run dev servers
pnpm dev              # frontend → localhost:3000
uv run api:dev        # backend API → localhost:8000
uv run worker:dev     # background workers

# Run tests
pnpm test             # frontend unit
cd backend/api && pytest  # backend unit
pnpm test:e2e         # Playwright e2e
```

## License

Apache-2.0
