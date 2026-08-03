"""Normalize raw records to canonical FairProcess schema."""
from typing import Dict, Any, List
from datetime import datetime

from harvesters.base import RawRecord


class RecordNormalizer:
    """Maps raw county records to canonical evidence schema."""

    # Jurisdiction-specific field mappings
    FIELD_MAPS = {
        "oakland_ca": {
            "case_number": ["case_number", "case_id", "case no", "case#"],
            "address": ["address", "property_address", "location"],
            "violation": ["violation", "description", "violation_description"],
            "date_issued": ["date_issued", "issue_date", "date", "created_at"],
            "status": ["status", "case_status"],
            "fine_amount": ["fine", "penalty", "amount", "fine_amount"],
        }
    }

    def normalize(self, record: RawRecord, jurisdiction: str = "oakland_ca") -> Dict[str, Any]:
        """Convert a raw record to canonical evidence format."""
        field_map = self.FIELD_MAPS.get(jurisdiction, self.FIELD_MAPS["oakland_ca"])
        raw = record.raw_data

        normalized = {
            "source_portal": record.source_portal,
            "source_record_id": record.source_record_id,
            "source_url": record.source_url,
            "scraped_at": datetime.utcnow().isoformat(),
            "canonical": {
                "case_number": self._extract_field(raw, field_map["case_number"]),
                "address": self._extract_field(raw, field_map["address"]),
                "violation_description": self._extract_field(raw, field_map["violation"]),
                "date_issued": self._parse_date(self._extract_field(raw, field_map["date_issued"])),
                "status": self._extract_field(raw, field_map["status"]),
                "fine_amount": self._parse_amount(self._extract_field(raw, field_map["fine_amount"])),
            },
            "raw": raw,
        }

        return normalized

    def _extract_field(self, data: Dict, candidates: List[str]) -> Any:
        for key in candidates:
            if key in data:
                return data[key]
            # Try case-insensitive
            for k, v in data.items():
                if k.lower() == key.lower():
                    return v
        return None

    def _parse_date(self, value: Any) -> str:
        if not value:
            return None
        if isinstance(value, str):
            # Try common formats
            for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"]:
                try:
                    return datetime.strptime(value[:19], fmt).isoformat()
                except ValueError:
                    continue
        return str(value)

    def _parse_amount(self, value: Any) -> float:
        if not value:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.replace("$", "").replace(",", "").strip()
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None
