"""Shared types used across API, workers, and frontend.

These are mirrored in TypeScript at frontend/web/src/lib/types.ts
"""
from enum import Enum
from typing import TypedDict, Optional, List, Dict, Any


class EvidenceType(str, Enum):
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


class EvidenceStatus(str, Enum):
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


class GeoJSON(TypedDict):
    type: str
    coordinates: Any
