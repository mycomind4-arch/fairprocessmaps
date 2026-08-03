"""Unit tests for the RecordNormalizer."""
import pytest
from unittest.mock import MagicMock

from normalizers.record_normalizer import RecordNormalizer


class TestRecordNormalizer:
    @pytest.fixture
    def normalizer(self):
        return RecordNormalizer()

    @pytest.fixture
    def raw_record(self):
        record = MagicMock()
        record.source_portal = "ckan"
        record.source_record_id = "12345"
        record.source_url = "https://data.oakland.ca.gov/dataset/code-enforcement"
        record.raw_data = {
            "case_number": "CE-2026-001",
            "address": "1234 Main St, Oakland, CA 94607",
            "violation": "Overgrown vegetation",
            "date_issued": "2026-01-15",
            "status": "Open",
            "fine_amount": "$500.00",
            "parcel_id": "01-1234-567",
            "owner_name": "Jane Doe",
        }
        return record

    def test_normalize_oakland(self, normalizer, raw_record):
        result = normalizer.normalize(raw_record, "oakland_ca")
        assert result["source_portal"] == "ckan"
        assert result["jurisdiction"] == "oakland_ca"
        assert result["canonical"]["case_number"] == "CE-2026-001"
        assert result["canonical"]["address"] == "1234 Main St, Oakland, CA 94607"
        assert result["canonical"]["violation_description"] == "Overgrown vegetation"
        assert result["canonical"]["status"] == "Open"
        assert result["canonical"]["fine_amount"] == 500.0
        assert result["canonical"]["parcel_id"] == "01-1234-567"
        assert result["canonical"]["owner_name"] == "Jane Doe"

    def test_normalize_alameda_county(self, normalizer, raw_record):
        """Alameda County uses different field names."""
        raw_record.raw_data = {
            "case_id": "AC-2026-042",
            "location_address": "456 Oak Ave, Hayward, CA 94541",
            "violation_type": "Illegal dumping",
            "violation_date": "01/20/2026",
            "violation_status": "Pending",
            "penalty_amount": "750",
            "parcel_number": "432-100-012",
            "owner_name": "Acme LLC",
        }
        result = normalizer.normalize(raw_record, "alameda_county_ca")
        assert result["canonical"]["case_number"] == "AC-2026-042"
        assert result["canonical"]["address"] == "456 Oak Ave, Hayward, CA 94541"
        assert result["canonical"]["violation_description"] == "Illegal dumping"
        assert result["canonical"]["fine_amount"] == 750.0
        assert result["canonical"]["parcel_id"] == "432-100-012"

    def test_normalize_humboldt_county(self, normalizer, raw_record):
        """Humboldt County field mapping."""
        raw_record.raw_data = {
            "case_no": "HUM-2026-003",
            "site_address": "789 Redwood Dr, Eureka, CA 95501",
            "code_section": "16.08.030",
            "notice_date": "2026-02-01",
            "enforcement_status": "Active",
            "civil_penalty": "1,250",
            "apn": "123-456-789",
            "assessee": "John Smith",
        }
        result = normalizer.normalize(raw_record, "humboldt_county_ca")
        assert result["canonical"]["case_number"] == "HUM-2026-003"
        assert result["canonical"]["address"] == "789 Redwood Dr, Eureka, CA 95501"
        assert result["canonical"]["fine_amount"] == 1250.0
        assert result["canonical"]["parcel_id"] == "123-456-789"

    def test_normalize_unknown_jurisdiction_falls_back(self, normalizer, raw_record):
        """Unknown jurisdiction falls back to oakland_ca mapping."""
        result = normalizer.normalize(raw_record, "unknown_county")
        # Should still produce output using oakland_ca mapping
        assert result["canonical"]["case_number"] == "CE-2026-001"

    def test_parse_amount_with_dollar_sign(self, normalizer):
        assert normalizer._parse_amount("$1,234.56") == 1234.56
        assert normalizer._parse_amount("$500") == 500.0
        assert normalizer._parse_amount("1,000") == 1000.0

    def test_parse_amount_none(self, normalizer):
        assert normalizer._parse_amount(None) is None
        assert normalizer._parse_amount("") is None
        assert normalizer._parse_amount("not a number") is None

    def test_parse_date_formats(self, normalizer):
        assert normalizer._parse_date("2026-01-15").startswith("2026-01-15")
        assert normalizer._parse_date("01/15/2026").startswith("2026-01-15")
        assert normalizer._parse_date(None) is None

    def test_list_jurisdictions(self, normalizer):
        jurisdictions = normalizer.list_jurisdictions()
        assert "oakland_ca" in jurisdictions
        assert "alameda_county_ca" in jurisdictions
        assert "humboldt_county_ca" in jurisdictions
        assert "san_francisco_ca" in jurisdictions
        assert "los_angeles_ca" in jurisdictions
        assert len(jurisdictions) >= 5
