"""Document upload routes."""
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, Depends, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.services.storage import StorageService
from src.services.ingestion_pipeline import IngestionPipeline

router = APIRouter()


@router.post("/property/{property_id}")
async def upload_document(
    property_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    evidence_type: str = Form("other"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document and queue it for OCR + AI extraction."""
    storage = StorageService()
    key = await storage.upload(file, property_id=str(property_id))

    # Process inline (BackgroundTasks runs after response is sent)
    pipeline = IngestionPipeline(storage=storage)

    async def process():
        from src.database import async_session
        async with async_session() as session:
            await pipeline.process_upload(
                property_id=str(property_id),
                storage_key=key,
                file_name=file.filename,
                mime_type=file.content_type,
                evidence_type=evidence_type,
                db=session,
            )

    background_tasks.add_task(process)

    return {"status": "queued", "storage_key": key}
