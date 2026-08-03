"""Background ingestion pipeline.

Orchestrates: OCR → AI extraction → normalization → graph linking → indexing.
"""
from uuid import UUID
from typing import Optional

from src.config import settings


class IngestionPipeline:
    """Processes uploaded documents through the full pipeline."""

    async def process_upload(
        self,
        property_id: UUID,
        storage_key: str,
        file_name: str,
        mime_type: str,
        evidence_type: str,
    ):
        """Run full pipeline on an uploaded document."""
        # Step 1: Create evidence record (would use DB session in production)
        evidence_id = UUID(int=0)  # placeholder

        # Step 2: OCR (Tesseract / Docling)
        # ocr_text = await self._run_ocr(storage_key, mime_type)

        # Step 3: AI extraction (LangGraph agent)
        # extracted = await self._run_extraction(ocr_text)

        # Step 4: Normalize to canonical schema
        # normalized = self._normalize(extracted)

        # Step 5: Link to knowledge graph (Neo4j)
        # await self._link_to_graph(property_id, evidence_id, normalized)

        # Step 6: Generate timeline events
        # events = self._generate_timeline(normalized)

        # Step 7: Index for search (Meilisearch)
        # await self._index_for_search(evidence_id, normalized)

        # Step 8: Run due-process analysis
        # flags = await self._analyze_due_process(property_id)

        pass  # Full implementation in workers/

    async def _run_ocr(self, storage_key: str, mime_type: str) -> str:
        # Would call Docling / Tesseract / Marker
        return ""

    async def _run_extraction(self, text: str) -> dict:
        # Would call LangGraph agent
        return {}

    def _normalize(self, extracted: dict) -> dict:
        # Map to canonical schema
        return extracted

    async def _link_to_graph(self, property_id: UUID, evidence_id: UUID, data: dict):
        # Would write to Neo4j
        pass

    def _generate_timeline(self, data: dict) -> list:
        # Would create TimelineEvent records
        return []

    async def _index_for_search(self, evidence_id: UUID, data: dict):
        # Would index in Meilisearch
        pass

    async def _analyze_due_process(self, property_id: UUID):
        # Would trigger DueProcessAnalyzer
        pass
