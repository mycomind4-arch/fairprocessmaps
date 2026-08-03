# Architecture Decision Records

## ADR-001: Evidence-Anchored Data Model
**Date:** 2026-08-03
**Status:** Accepted

Every piece of evidence is anchored to a `Property` entity. This ensures traceability — all documents, timeline events, and due-process analyses can be traced back to a specific parcel.

## ADR-002: LangGraph for AI Pipeline
**Date:** 2026-08-03
**Status:** Accepted

We use LangGraph for the evidence extraction pipeline because it supports stateful, multi-step AI workflows with branching and error recovery. The graph structure maps directly to our ingestion pipeline: OCR → Extract → Normalize → Link → Timeline → Analyze → Index.

## ADR-003: PostGIS + pgvector for Spatial + Semantic Search
**Date:** 2026-08-03
**Status:** Accepted

PostGIS provides spatial indexing (GIST) for parcel boundary queries. pgvector extends Postgres with vector embeddings for semantic search of evidence documents, avoiding the need for a separate vector database.

## ADR-004: Temporal for Durable Workflows
**Date:** 2026-08-03
**Status:** Accepted

Document ingestion is long-running (OCR + LLM calls can take minutes). Temporal provides durability, retries, and visibility for these workflows — if a worker crashes mid-processing, the workflow resumes from the last completed activity.

## ADR-005: Dual Search — Meilisearch + PostGIS
**Date:** 2026-08-03
**Status:** Accepted

Meilisearch handles fast full-text search across evidence documents. PostGIS handles spatial queries (properties within radius, within county). The search API merges results from both for hybrid queries.
