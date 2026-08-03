"""Due-process analyzer unit tests."""
import pytest
from datetime import date
from unittest.mock import MagicMock

from src.services.due_process_analyzer import DueProcessAnalyzer


def test_no_notice_before_action():
    analyzer = DueProcessAnalyzer()

    # Mock timeline: action without prior notice
    action = MagicMock()
    action.event_type = "decision_rendered"
    action.event_date = date(2026, 3, 1)
    action.receiving_party = "Jane Doe"
    action.evidence_id = None

    timeline = [action]
    evidence = []

    report = analyzer.analyze(evidence, timeline)
    assert report.overall_score < 100
    assert any(f.rule_id == "notice_timing" for f in report.flags)


def test_adequate_notice_period():
    analyzer = DueProcessAnalyzer()

    notice = MagicMock()
    notice.event_type = "notice_issued"
    notice.event_date = date(2026, 1, 1)
    notice.receiving_party = "Jane Doe"
    notice.evidence_id = "ev-001"

    action = MagicMock()
    action.event_type = "hearing_scheduled"
    action.event_date = date(2026, 2, 1)
    action.receiving_party = "Jane Doe"
    action.evidence_id = "ev-002"

    timeline = [notice, action]
    evidence = []

    report = analyzer.analyze(evidence, timeline)
    assert report.overall_score == 100
    assert len(report.flags) == 0
