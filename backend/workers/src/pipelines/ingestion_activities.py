"""Temporal activities for the ingestion pipeline."""
from temporalio import activity
from uuid import UUID

from ai.src.extractors.document_extractor import DocumentExtractor
from ai.src.graphs.evidence_graph import evidence_graph
from ai.src.agents.due_process_agent import EntityExtractionAgent


@activity.defn
async def ingest_document(evidence_id: str, property_id: str, storage_key: str) -> dict:
    """Run full ingestion pipeline on a document."""
    # Step 1: Fetch from MinIO
    # Step 2: OCR / extract text
    extractor = DocumentExtractor()
    # text = await extractor.extract_from_storage(storage_key)

    # Step 3: Run LangGraph workflow
    initial_state = {
        "evidence_id": evidence_id,
        "property_id": property_id,
        "raw_text": "",  # populated from OCR
        "ocr_text": "",
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

    # result = evidence_graph.invoke(initial_state)

    return {
        "evidence_id": evidence_id,
        "status": "completed",
        "extracted_entities_count": 0,
    }
