"""Due-process analysis routes."""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.models.evidence import Evidence
from src.models.timeline import TimelineEvent
from src.schemas.due_process import DueProcessReport, DueProcessFlag
from src.services.due_process_analyzer import DueProcessAnalyzer

router = APIRouter()


@router.get("/property/{property_id}", response_model=DueProcessReport)
async def analyze_property(
    property_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Run due-process analysis on all evidence for a property."""
    # Fetch all evidence
    result = await db.execute(
        select(Evidence).where(Evidence.property_id == property_id)
    )
    evidence_list = result.scalars().all()

    # Fetch timeline
    result = await db.execute(
        select(TimelineEvent).where(TimelineEvent.property_id == property_id)
    )
    timeline = result.scalars().all()

    analyzer = DueProcessAnalyzer()
    report = analyzer.analyze(evidence_list, timeline)
    return report
