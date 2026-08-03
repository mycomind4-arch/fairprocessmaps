"""Background ingestion pipeline.

Orchestrates: OCR → AI extraction → normalization → graph linking → timeline → indexing.
Uses the LangGraph evidence_graph for the AI-heavy steps.
"""
import uuid
from datetime import datetime
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.evidence import Evidence, EvidenceStatus
from src.models.timeline import TimelineEvent
from src.services.storage import StorageService

logger = structlog.get_logger("fairprocess.ingestion")


class IngestionPipeline:
    """Processes uploaded documents through the full pipeline."""

    def __init__(self, storage: Optional[StorageService] = None):
        self.storage = storage

    async def process_upload(
        self,
        property_id: str,
        storage_key: str,
        file_name: str,
        mime_type: str,
        evidence_type: str,
        db: AsyncSession,
    ):
        """Run the full ingestion pipeline on an uploaded document.

        Steps:
        1. Create evidence record (status: raw)
        2. Fetch file from MinIO and run OCR
        3. Run LangGraph extraction (entities, dates, parties, violations)
        4. Normalize to canonical schema
        5. Generate timeline events from extracted dates
        6. Index for Meilisearch
        7. Run due-process analysis
        """
        correlation_id = str(uuid.uuid4())

        # Step 1: Create evidence record
        evidence = Evidence(
            property_id=property_id,
            title=file_name or "Untitled document",
            evidence_type=evidence_type,
            status=EvidenceStatus.RAW,
            storage_key=storage_key,
            file_name=file_name,
            mime_type=mime_type,
        )
        db.add(evidence)
        await db.commit()
        await db.refresh(evidence)

        logger.info(
            "ingestion_started",
            evidence_id=str(evidence.id),
            property_id=str(property_id),
            file_name=file_name,
            correlation_id=correlation_id,
        )

        try:
            # Step 2: OCR / text extraction
            evidence.status = EvidenceStatus.OCR_PENDING
            await db.commit()

            ocr_text = await self._run_ocr(storage_key, mime_type)
            evidence.ocr_text = ocr_text
            evidence.status = EvidenceStatus.OCR_COMPLETE
            await db.commit()

            logger.info(
                "ocr_complete",
                evidence_id=str(evidence.id),
                text_length=len(ocr_text),
                correlation_id=correlation_id,
            )

            # Step 3: AI extraction via LangGraph
            evidence.status = EvidenceStatus.EXTRACTION_PENDING
            await db.commit()

            extracted = await self._run_extraction(ocr_text)

            evidence.extracted_entities = extracted.get("entities", [])
            evidence.extracted_dates = extracted.get("dates", [])
            evidence.extracted_parties = extracted.get("parties", [])
            evidence.extracted_violations = extracted.get("violations", [])
            evidence.extracted_fines = extracted.get("fines", [])
            evidence.extracted_markdown = extracted.get("markdown")
            evidence.status = EvidenceStatus.EXTRACTED
            await db.commit()

            logger.info(
                "extraction_complete",
                evidence_id=str(evidence.id),
                entities=len(extracted.get("entities", [])),
                dates=len(extracted.get("dates", [])),
                correlation_id=correlation_id,
            )

            # Step 4: Normalize
            normalized = self._normalize(extracted)
            evidence.status = EvidenceStatus.NORMALIZED
            await db.commit()

            # Step 5: Generate timeline events
            events = self._generate_timeline(evidence, normalized)
            for event in events:
                db.add(event)
            await db.commit()

            logger.info(
                "timeline_generated",
                evidence_id=str(evidence.id),
                events_count=len(events),
                correlation_id=correlation_id,
            )

            # Step 6: Index for search
            await self._index_for_search(evidence, normalized)

            # Step 7: Mark as analyzed
            evidence.status = EvidenceStatus.ANALYZED
            evidence.processed_at = datetime.utcnow()
            evidence.processed_by = "ingestion_pipeline"
            await db.commit()

            logger.info(
                "ingestion_complete",
                evidence_id=str(evidence.id),
                correlation_id=correlation_id,
            )

            return {
                "evidence_id": str(evidence.id),
                "status": "completed",
                "extracted_entities_count": len(extracted.get("entities", [])),
                "timeline_events_count": len(events),
            }

        except Exception as exc:
            logger.error(
                "ingestion_failed",
                evidence_id=str(evidence.id),
                error=str(exc),
                correlation_id=correlation_id,
            )
            evidence.status = EvidenceStatus.RAW
            await db.commit()
            raise

    async def _run_ocr(self, storage_key: str, mime_type: str) -> str:
        """Extract text from a stored document.

        Uses Docling for PDFs and structured docs, Tesseract for images.
        Falls back to raw text passthrough for text files.
        """
        if not self.storage:
            self.storage = StorageService()

        # Fetch file bytes from MinIO
        try:
            file_bytes = self.storage.get_object(storage_key)
        except Exception:
            logger.warning("storage_fetch_failed", key=storage_key)
            return ""

        # Text files — passthrough
        if mime_type and mime_type.startswith("text/"):
            return file_bytes.decode("utf-8", errors="replace")

        # PDFs and images — use DocumentExtractor
        try:
            from ai.src.extractors.document_extractor import DocumentExtractor

            extractor = DocumentExtractor()
            result = await extractor.extract(file_bytes, mime_type)
            return result.get("text", "")
        except ImportError:
            logger.warning("docling_not_available", msg="AI module not importable in API process")
            return ""
        except Exception as exc:
            logger.warning("ocr_failed", error=str(exc))
            return ""

    async def _run_extraction(self, text: str) -> dict:
        """Run LangGraph evidence extraction on OCR'd text."""
        if not text.strip():
            return {}

        try:
            from ai.src.graphs.evidence_graph import evidence_graph

            initial_state = {
                "evidence_id": "",
                "property_id": "",
                "raw_text": text,
                "ocr_text": text,
                "extracted_entities": [],
                "extracted_dates": [],
                "extracted_parties": [],
                "extracted_violations": [],
                "extracted_fines": [],
                "normalized": {},
                "timeline_events": [],
                "due_process_flags": [],
                "due_process_score": 0,
                "errors": [],
            }

            result = evidence_graph.invoke(initial_state)

            return {
                "entities": result.get("extracted_entities", []),
                "dates": result.get("extracted_dates", []),
                "parties": result.get("extracted_parties", []),
                "violations": result.get("extracted_violations", []),
                "fines": result.get("extracted_fines", []),
                "markdown": result.get("normalized", {}).get("markdown"),
            }
        except ImportError:
            logger.warning("langgraph_not_available", msg="AI module not importable in API process")
            return {}
        except Exception as exc:
            logger.warning("extraction_failed", error=str(exc))
            return {}

    def _normalize(self, extracted: dict) -> dict:
        """Map extracted data to canonical evidence schema."""
        return {
            "evidence_type": "code_enforcement_notice",
            "canonical_dates": {
                d.get("type"): d.get("date")
                for d in extracted.get("dates", [])
                if d.get("type") and d.get("date")
            },
            "canonical_parties": extracted.get("parties", []),
            "canonical_violations": extracted.get("violations", []),
            "canonical_fines": extracted.get("fines", []),
        }

    def _generate_timeline(self, evidence: Evidence, normalized: dict) -> list:
        """Create TimelineEvent records from extracted dates."""
        events = []
        canonical_dates = normalized.get("canonical_dates", {})

        event_type_map = {
            "notice": "notice_issued",
            "hearing": "hearing_scheduled",
            "deadline": "compliance_deadline",
            "decision": "decision_rendered",
            "appeal": "appeal_deadline",
        }

        for date_type, date_value in canonical_dates.items():
            if not date_value:
                continue

            event_type = event_type_map.get(date_type, "other_event")
            is_critical = event_type in ("notice_issued", "decision_rendered")

            events.append(TimelineEvent(
                property_id=evidence.property_id,
                evidence_id=evidence.id,
                event_type=event_type,
                title=f"{event_type.replace('_', ' ').title()}",
                event_date=date_value,
                initiating_party=None,
                receiving_party=None,
                is_due_process_critical=is_critical,
                source_text=evidence.ocr_text[:500] if evidence.ocr_text else None,
            ))

        return events

    async def _index_for_search(self, evidence: Evidence, normalized: dict):
        """Index the evidence record in Meilisearch."""
        try:
            from src.services.search_index import SearchIndexService

            svc = SearchIndexService()
            await svc.index_document("evidence", {
                "id": str(evidence.id),
                "title": evidence.title,
                "description": evidence.description or "",
                "ocr_text": (evidence.ocr_text or "")[:500],
                "evidence_type": evidence.evidence_type.value if evidence.evidence_type else "other",
                "property_id": str(evidence.property_id),
                "status": evidence.status.value if evidence.status else "raw",
            })
        except Exception as exc:
            logger.warning("indexing_failed", error=str(exc))
