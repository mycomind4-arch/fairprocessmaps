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

    # Queue background processing
    pipeline = IngestionPipeline()
    background_tasks.add_task(
        pipeline.process_upload,
        property_id=property_id,
        storage_key=key,
        file_name=file.filename,
        mime_type=file.content_type,
        evidence_type=evidence_type,
    )

    return {"status": "queued", "storage_key": key}
