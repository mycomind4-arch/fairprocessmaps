"""Timeline routes."""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc

from src.database import get_db
from src.models.timeline import TimelineEvent
from src.schemas.timeline import TimelineEventOut

router = APIRouter()


@router.get("/{property_id}", response_model=List[TimelineEventOut])
async def get_timeline(
    property_id: UUID,
    include_flags_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Get chronological timeline for a property."""
    stmt = select(TimelineEvent).where(TimelineEvent.property_id == property_id)
    if include_flags_only:
        stmt = stmt.where(TimelineEvent.discrepancy_flags != [])
    stmt = stmt.order_by(asc(TimelineEvent.event_date), asc(TimelineEvent.sequence_order))
    result = await db.execute(stmt)
    return result.scalars().all()
