"""Temporal activities for due-process analysis."""
from temporalio import activity
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from workers.src.config import settings
from api.src.models.evidence import Evidence
from api.src.models.timeline import TimelineEvent
from api.src.services.due_process_analyzer import DueProcessAnalyzer

engine = create_async_engine(settings.DATABASE_URL)
session_maker = async_sessionmaker(engine, expire_on_commit=False)


@activity.defn
async def analyze_due_process(property_id: str) -> dict:
    """Fetch evidence and timeline, run due-process analysis."""
    async with session_maker() as session:
        result = await session.execute(
            select(Evidence).where(Evidence.property_id == property_id)
        )
        evidence_list = result.scalars().all()

        result = await session.execute(
            select(TimelineEvent).where(TimelineEvent.property_id == property_id)
        )
        timeline = result.scalars().all()

        analyzer = DueProcessAnalyzer()
        report = analyzer.analyze(evidence_list, timeline)

        return report.model_dump()
