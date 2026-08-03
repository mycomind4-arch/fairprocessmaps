"""Normalize raw records to canonical FairProcess schema."""
from typing import Dict, Any, List, Optional
from datetime import datetime

from harvesters.base import RawRecord


class RecordNormalizer:
    """Maps raw county records to canonical evidence schema."""

    # Jurisdiction-specific field mappings
    FIELD_MAPS: Dict[str, Dict[str, List[str]]] = {
        "oakland_ca": {
            "case_number": ["case_number", "case_id", "case no", "case#", "CaseNumber"],
            "address": ["address", "property_address", "location", "site_address"],
            "violation": ["violation", "description", "violation_description", "ViolationDesc"],
            "date_issued": ["date_issued", "issue_date", "date", "created_at", "open_date"],
            "status": ["status", "case_status", "Status"],
            "fine_amount": ["fine", "penalty", "amount", "fine_amount", "FineAmount"],
            "parcel_id": ["parcel_id", "apn", "assessor_parcel_number", "ParcelNumber"],
            "owner_name": ["owner", "owner_name", "property_owner", "OwnerName"],
            "hearing_date": ["hearing_date", "hearing", "hearing_scheduled"],
        },
        "alameda_county_ca": {
            "case_number": ["case_id", "case_number", "record_id", "id"],
            "address": ["address", "property_address", "location_address", "addr1"],
            "violation": ["violation_type", "violation", "code_violation", "description"],
            "date_issued": ["date_issued", "issue_date", "violation_date", "created"],
            "status": ["status", "case_status", "violation_status", "state"],
            "fine_amount": ["fine_amount", "penalty_amount", "amount_due", "balance"],
            "parcel_id": ["parcel_number", "apn", "parcel_id"],
            "owner_name": ["owner_name", "owner", "registered_owner"],
            "hearing_date": ["hearing_date", "hearing", "court_date"],
        },
        "humboldt_county_ca": {
            "case_number": ["case_no", "case_number", "code_case", "enforcement_case"],
            "address": ["address", "site_address", "property_location", "situs_address"],
            "violation": ["violation", "code_section", "violation_description", "nature"],
            "date_issued": ["date_issued", "notice_date", "issue_date", "complaint_date"],
            "status": ["status", "case_status", "enforcement_status"],
            "fine_amount": ["fine", "penalty", "civil_penalty", "amount"],
            "parcel_id": ["parcel_id", "apn", "assessor_parcel"],
            "owner_name": ["owner", "owner_name", "property_owner", "assessee"],
            "hearing_date": ["hearing_date", "hearing", "conference_date"],
        },
        "san_francisco_ca": {
            "case_number": ["case_number", "complaint_number", "ticket_number", "record_id"],
            "address": ["address", "property_address", "location", "block_lot"],
            "violation": ["violation", "description", "violation_description", "code_section"],
            "date_issued": ["date_issued", "opened", "created_date", "filed_date"],
            "status": ["status", "case_status", "complaint_status"],
            "fine_amount": ["fine", "penalty", "amount", "abatement_cost"],
            "parcel_id": ["parcel_id", "block_lot", "apn"],
            "owner_name": ["owner_name", "owner", "assessee_name"],
            "hearing_date": ["hearing_date", "hearing", "dba_hearing_date"],
        },
        "los_angeles_ca": {
            "case_number": ["case_number", "case_id", "lacase", "record_id"],
            "address": ["address", "property_address", "location", "situs"],
            "violation": ["violation", "description", "violation_type", "code_violation"],
            "date_issued": ["date_issued", "issue_date", "open_date", "created"],
            "status": ["status", "case_status", "disposition"],
            "fine_amount": ["fine", "penalty", "amount", "order_amount"],
            "parcel_id": ["parcel_id", "apn", "ain", "assessor_id"],
            "owner_name": ["owner_name", "owner", "assessee"],
            "hearing_date": ["hearing_date", "hearing", " hearing_date_time"],
        },
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
            "jurisdiction": jurisdiction,
            "canonical": {
                "case_number": self._extract_field(raw, field_map["case_number"]),
                "address": self._extract_field(raw, field_map["address"]),
                "violation_description": self._extract_field(raw, field_map["violation"]),
                "date_issued": self._parse_date(self._extract_field(raw, field_map["date_issued"])),
                "status": self._extract_field(raw, field_map["status"]),
                "fine_amount": self._parse_amount(self._extract_field(raw, field_map["fine_amount"])),
                "parcel_id": self._extract_field(raw, field_map.get("parcel_id", [])),
                "owner_name": self._extract_field(raw, field_map.get("owner_name", [])),
                "hearing_date": self._parse_date(self._extract_field(raw, field_map.get("hearing_date", []))),
            },
            "raw": raw,
        }

        return normalized

    def list_jurisdictions(self) -> List[str]:
        """Return all supported jurisdiction keys."""
        return list(self.FIELD_MAPS.keys())

    def _extract_field(self, data: Dict, candidates: List[str]) -> Optional[str]:
        for key in candidates:
            if key in data:
                return data[key]
            # Try case-insensitive
            for k, v in data.items():
                if k.lower() == key.lower():
                    return v
        return None

    def _parse_date(self, value: Any) -> Optional[str]:
        if not value:
            return None
        if isinstance(value, str):
            for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%m-%d-%Y"]:
                try:
                    return datetime.strptime(value[:19], fmt).isoformat()
                except ValueError:
                    continue
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)

    def _parse_amount(self, value: Any) -> Optional[float]:
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
