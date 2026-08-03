"""Due-process analysis schemas."""
from typing import List, Optional
from pydantic import BaseModel


class DueProcessFlag(BaseModel):
    rule_id: str
    rule_name: str
    severity: str  # critical, warning, info
    description: str
    evidence_ids: List[str]
    suggested_action: Optional[str] = None
    relevant_statute: Optional[str] = None


class DueProcessReport(BaseModel):
    property_id: str
    overall_score: int  # 0-100
    flags: List[DueProcessFlag]
    summary: str
    recommendations: List[str]
