"""Search result schemas."""
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class SearchResult(BaseModel):
    id: UUID
    type: str  # property, evidence, timeline_event
    title: str
    snippet: str
    score: float
    property_id: Optional[UUID] = None
    evidence_id: Optional[UUID] = None
    highlight: dict
