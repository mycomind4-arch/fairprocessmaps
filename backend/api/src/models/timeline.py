"""Timeline event model."""
from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey, Date, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from src.database import Base


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id = Column(UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False, index=True)
    evidence_id = Column(UUID(as_uuid=True), ForeignKey("evidence.id"), nullable=True, index=True)

    # Event classification
    event_type = Column(String(64), nullable=False, index=True)
    # notice_issued, hearing_scheduled, hearing_held, decision_rendered, 
    # appeal_filed, appeal_deadline, compliance_deadline, violation_observed, etc.

    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    # Temporal
    event_date = Column(Date, nullable=False, index=True)
    event_time = Column(DateTime, nullable=True)
    deadline_date = Column(Date, nullable=True)

    # Parties
    initiating_party = Column(String(256), nullable=True)
    receiving_party = Column(String(256), nullable=True)

    # Location / jurisdiction
    jurisdiction = Column(String(128), nullable=True)
    venue = Column(String(256), nullable=True)

    # Due-process flags
    is_due_process_critical = Column(Boolean, default=False, index=True)
    discrepancy_flags = Column(JSON, default=list)

    # Sequence
    sequence_order = Column(Integer, nullable=True)
    previous_event_id = Column(UUID(as_uuid=True), ForeignKey("timeline_events.id"), nullable=True)

    # Source
    source_text = Column(Text, nullable=True)  # excerpt from original document
    source_page = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="timeline_events")
    evidence = relationship("Evidence", back_populates="timeline_events")
