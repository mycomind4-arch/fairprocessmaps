"""Timeline Pydantic schemas."""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel


class TimelineEventOut(BaseModel):
    id: UUID
    property_id: UUID
    evidence_id: Optional[UUID] = None
    event_type: str
    title: str
    description: Optional[str] = None
    event_date: date
    event_time: Optional[datetime] = None
    deadline_date: Optional[date] = None
    initiating_party: Optional[str] = None
    receiving_party: Optional[str] = None
    jurisdiction: Optional[str] = None
    venue: Optional[str] = None
    is_due_process_critical: bool
    discrepancy_flags: List[Dict[str, Any]]
    sequence_order: Optional[int] = None
    source_text: Optional[str] = None
    source_page: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
