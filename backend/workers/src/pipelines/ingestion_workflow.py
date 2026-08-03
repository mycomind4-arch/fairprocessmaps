"""Temporal workflow for document ingestion pipeline.

Steps: OCR → AI extraction → normalization → graph linking → timeline → indexing
"""
from datetime import timedelta
from uuid import UUID
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.pipelines.ingestion_activities import ingest_document


@workflow.defn
class IngestionWorkflow:
    """Durable workflow for processing a single document through the full pipeline."""

    @workflow.run
    async def run(self, evidence_id: str, property_id: str, storage_key: str) -> dict:
        result = await workflow.execute_activity(
            ingest_document,
            args=(evidence_id, property_id, storage_key),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=10),
            ),
        )
        return result
