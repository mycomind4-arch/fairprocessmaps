"""Evidence document model."""
from sqlalchemy import Column, String, DateTime, Text, JSON, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from src.database import Base


class EvidenceType(str, enum.Enum):
    CODE_ENFORCEMENT_NOTICE = "code_enforcement_notice"
    PERMIT_APPLICATION = "permit_application"
    COURT_FILING = "court_filing"
    HEARING_NOTICE = "hearing_notice"
    APPEAL_DOCUMENT = "appeal_document"
    INSPECTOR_REPORT = "inspector_report"
    PHOTOGRAPH = "photograph"
    VIDEO = "video"
    AUDIO = "audio"
    CORRESPONDENCE = "correspondence"
    PUBLIC_RECORD = "public_record"
    OTHER = "other"


class EvidenceStatus(str, enum.Enum):
    RAW = "raw"
    OCR_PENDING = "ocr_pending"
    OCR_COMPLETE = "ocr_complete"
    EXTRACTION_PENDING = "extraction_pending"
    EXTRACTED = "extracted"
    NORMALIZED = "normalized"
    LINKED = "linked"
    ANALYZED = "analyzed"
    FLAGGED = "flagged"
    ARCHIVED = "archived"


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id = Column(UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False, index=True)

    # Document metadata
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    evidence_type = Column(Enum(EvidenceType), nullable=False, index=True)
    status = Column(Enum(EvidenceStatus), default=EvidenceStatus.RAW, index=True)

    # Source tracking
    source_url = Column(Text, nullable=True)
    source_portal = Column(String(128), nullable=True)  # e.g. "socrata:oakland"
    source_record_id = Column(String(256), nullable=True)
    scraped_at = Column(DateTime, nullable=True)

    # Storage
    storage_bucket = Column(String(128), nullable=True)
    storage_key = Column(String(512), nullable=True)
    file_name = Column(String(512), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(128), nullable=True)
    checksum_sha256 = Column(String(64), nullable=True)

    # OCR / text extraction
    ocr_text = Column(Text, nullable=True)
    ocr_confidence = Column(Integer, nullable=True)  # 0-100
    extracted_markdown = Column(Text, nullable=True)

    # AI extraction results
    extracted_entities = Column(JSON, default=list)  # [{type, value, confidence, span}]
    extracted_dates = Column(JSON, default=list)
    extracted_parties = Column(JSON, default=list)
    extracted_violations = Column(JSON, default=list)
    extracted_fines = Column(JSON, default=list)

    # Due-process analysis
    due_process_flags = Column(JSON, default=list)  # [{rule, severity, description}]
    due_process_score = Column(Integer, nullable=True)  # 0-100

    # Vector embedding for semantic search
    embedding = Column(JSON, nullable=True)  # stored in pgvector; JSON here for fallback

    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    processed_by = Column(String(128), nullable=True)  # worker / agent name

    # Relationships
    property = relationship("Property", back_populates="evidence")
    timeline_events = relationship("TimelineEvent", back_populates="evidence")
