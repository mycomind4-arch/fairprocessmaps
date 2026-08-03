"""Evidence Pydantic schemas."""
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field

from src.models.evidence import EvidenceType, EvidenceStatus


class EvidenceBase(BaseModel):
    property_id: UUID
    title: str
    description: Optional[str] = None
    evidence_type: EvidenceType
    source_url: Optional[str] = None
    source_portal: Optional[str] = None
    source_record_id: Optional[str] = None


class EvidenceCreate(EvidenceBase):
    pass


class EvidenceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[EvidenceStatus] = None
    ocr_text: Optional[str] = None
    extracted_markdown: Optional[str] = None
    extracted_entities: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_dates: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_parties: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_violations: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_fines: List[Dict[str, Any]] = Field(default_factory=list)
    due_process_flags: List[Dict[str, Any]] = Field(default_factory=list)
    due_process_score: Optional[int] = None


class EvidenceOut(EvidenceBase):
    id: UUID
    status: EvidenceStatus
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    ocr_text: Optional[str] = None
    ocr_confidence: Optional[int] = None
    extracted_markdown: Optional[str] = None
    extracted_entities: List[Dict[str, Any]]
    extracted_dates: List[Dict[str, Any]]
    extracted_parties: List[Dict[str, Any]]
    extracted_violations: List[Dict[str, Any]]
    extracted_fines: List[Dict[str, Any]]
    due_process_flags: List[Dict[str, Any]]
    due_process_score: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
