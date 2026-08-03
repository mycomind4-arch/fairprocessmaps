"""Unit tests for the DueProcessAnalyzer."""
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

from src.services.due_process_analyzer import DueProcessAnalyzer


class TestDueProcessAnalyzer:
    @pytest.fixture
    def analyzer(self):
        return DueProcessAnalyzer()

    @pytest.fixture
    def evidence(self):
        ev = MagicMock()
        ev.id = "ev-001"
        ev.property_id = "prop-001"
        ev.ocr_text = "Notice of Code Enforcement Hearing scheduled for January 15, 2026. You have the right to appeal this decision within 30 days."
        ev.extracted_markdown = ""
        return ev

    @pytest.fixture
    def timeline_no_notice(self):
        """Timeline with action but no prior notice."""
        action = MagicMock()
        action.event_type = "hearing_scheduled"
        action.event_date = datetime(2026, 1, 15)
        action.evidence_id = "ev-001"
        action.receiving_party = "John Doe"
        return [action]

    @pytest.fixture
    def timeline_with_notice(self):
        """Timeline with adequate notice before action."""
        notice = MagicMock()
        notice.event_type = "notice_issued"
        notice.event_date = datetime(2026, 1, 1)
        notice.evidence_id = "ev-001"
        notice.receiving_party = "John Doe"

        action = MagicMock()
        action.event_type = "hearing_scheduled"
        action.event_date = datetime(2026, 1, 15)
        action.evidence_id = "ev-002"
        action.receiving_party = "John Doe"
        return [notice, action]

    @pytest.fixture
    def timeline_short_notice(self):
        """Timeline with insufficient notice period (3 days)."""
        notice = MagicMock()
        notice.event_type = "notice_issued"
        notice.event_date = datetime(2026, 1, 12)
        notice.evidence_id = "ev-001"
        notice.receiving_party = "John Doe"

        action = MagicMock()
        action.event_type = "hearing_scheduled"
        action.event_date = datetime(2026, 1, 15)
        action.evidence_id = "ev-002"
        action.receiving_party = "John Doe"
        return [notice, action]

    def test_no_timeline_no_flags(self, analyzer, evidence):
        """No timeline events → no flags, score = 100."""
        report = analyzer.analyze([evidence], [])
        assert report.overall_score == 100
        assert len(report.flags) == 0

    def test_action_without_notice_is_critical(self, analyzer, evidence, timeline_no_notice):
        """Action without prior notice → critical flag."""
        report = analyzer.analyze([evidence], timeline_no_notice)
        assert report.overall_score < 100
        critical_flags = [f for f in report.flags if f.severity == "critical"]
        assert len(critical_flags) > 0
        assert critical_flags[0].rule_id == "notice_timing"

    def test_adequate_notice_no_warning(self, analyzer, evidence, timeline_with_notice):
        """14 days between notice and action → no notice timing flag."""
        report = analyzer.analyze([evidence], timeline_with_notice)
        notice_flags = [f for f in report.flags if f.rule_id == "notice_timing"]
        # 14 days is ≥ 10 days default, so no flag
        assert len(notice_flags) == 0

    def test_short_notice_is_warning(self, analyzer, evidence, timeline_short_notice):
        """3 days between notice and action → warning flag."""
        report = analyzer.analyze([evidence], timeline_short_notice)
        notice_flags = [f for f in report.flags if f.rule_id == "notice_timing"]
        assert len(notice_flags) > 0
        assert notice_flags[0].severity == "warning"

    def test_adverse_action_without_hearing(self, analyzer, evidence):
        """Adverse action without hearing → critical flag."""
        action = MagicMock()
        action.event_type = "fine_imposed"
        action.event_date = datetime(2026, 1, 20)
        action.evidence_id = "ev-001"
        action.receiving_party = "John Doe"

        report = analyzer.analyze([evidence], [action])
        hearing_flags = [f for f in report.flags if f.rule_id == "hearing_right"]
        assert len(hearing_flags) > 0
        assert hearing_flags[0].severity == "critical"

    def test_score_calculation(self, analyzer, evidence):
        """Score = max(0, 100 - critical*25 - warning*10)."""
        # Create 2 critical + 1 warning
        action = MagicMock()
        action.event_type = "fine_imposed"
        action.event_date = datetime(2026, 1, 20)
        action.evidence_id = "ev-001"
        action.receiving_party = "John Doe"

        # No notice (critical) + no hearing (critical) = 50
        report = analyzer.analyze([evidence], [action])
        # Should have at least 2 critical flags
        critical_count = sum(1 for f in report.flags if f.severity == "critical")
        warning_count = sum(1 for f in report.flags if f.severity == "warning")
        expected_score = max(0, 100 - critical_count * 25 - warning_count * 10)
        assert report.overall_score == expected_score

    def test_recommendations_generated(self, analyzer, evidence):
        """Recommendations are generated based on flags."""
        report = analyzer.analyze([evidence], [])
        assert len(report.recommendations) > 0
        assert "No due-process discrepancies" in report.recommendations[0]

    def test_property_id_in_report(self, analyzer, evidence):
        """Report includes the property_id from evidence."""
        report = analyzer.analyze([evidence], [])
        assert report.property_id == "prop-001"
