"""Temporal activities for the ingestion pipeline."""
from temporalio import activity
import structlog

logger = structlog.get_logger("fairprocess.worker.ingestion")


@activity.defn
async def ingest_document(evidence_id: str, property_id: str, storage_key: str) -> dict:
    """Run full ingestion pipeline on a document via the API service.

    This activity delegates to the API ingestion pipeline, which handles:
    OCR → AI extraction → normalization → graph linking → timeline → indexing
    """
    logger.info(
        "ingest_activity_started",
        evidence_id=evidence_id,
        property_id=property_id,
        storage_key=storage_key,
    )

    try:
        # Import here to avoid circular deps at module load
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from api.src.services.ingestion_pipeline import IngestionPipeline
        from api.src.services.storage import StorageService
        from workers.src.config import settings

        engine = create_async_engine(settings.DATABASE_URL)
        session_maker = async_sessionmaker(engine, expire_on_commit=False)

        storage = StorageService()
        pipeline = IngestionPipeline(storage=storage)

        async with session_maker() as session:
            result = await pipeline.process_upload(
                property_id=property_id,
                storage_key=storage_key,
                file_name=storage_key.split("/")[-1] if storage_key else "document",
                mime_type="application/octet-stream",
                evidence_type="other",
                db=session,
            )

        await engine.dispose()

        logger.info(
            "ingest_activity_complete",
            evidence_id=evidence_id,
            result=result,
        )

        return result

    except Exception as e:
        logger.error("ingest_activity_failed", evidence_id=evidence_id, error=str(e))
        return {"evidence_id": evidence_id, "status": "failed", "error": str(e)}
