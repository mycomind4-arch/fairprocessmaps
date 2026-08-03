"""Evidence routes."""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from src.database import get_db
from src.models.evidence import Evidence, EvidenceStatus, EvidenceType
from src.schemas.evidence import EvidenceCreate, EvidenceOut, EvidenceUpdate

router = APIRouter()


@router.get("", response_model=List[EvidenceOut])
async def list_evidence(
    property_id: Optional[UUID] = Query(None),
    evidence_type: Optional[EvidenceType] = Query(None),
    status: Optional[EvidenceStatus] = Query(None),
    has_due_process_flags: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List evidence with filters."""
    stmt = select(Evidence)
    if property_id:
        stmt = stmt.where(Evidence.property_id == property_id)
    if evidence_type:
        stmt = stmt.where(Evidence.evidence_type == evidence_type)
    if status:
        stmt = stmt.where(Evidence.status == status)
    if has_due_process_flags is not None:
        if has_due_process_flags:
            stmt = stmt.where(Evidence.due_process_flags != [])
        else:
            stmt = stmt.where(Evidence.due_process_flags == [])

    stmt = stmt.order_by(desc(Evidence.created_at)).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{evidence_id}", response_model=EvidenceOut)
async def get_evidence(evidence_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Evidence).where(Evidence.id == evidence_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return ev


@router.patch("/{evidence_id}", response_model=EvidenceOut)
async def update_evidence(
    evidence_id: UUID, data: EvidenceUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Evidence).where(Evidence.id == evidence_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ev, field, value)

    await db.commit()
    await db.refresh(ev)
    return ev
