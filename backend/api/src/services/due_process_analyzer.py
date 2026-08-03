"""Due-process analysis engine.

Checks evidence and timeline against procedural rules to detect
potential due-process violations.
"""
from typing import List, Dict, Any
from datetime import datetime, timedelta

from src.schemas.due_process import DueProcessReport, DueProcessFlag


class DueProcessAnalyzer:
    """Analyzes evidence and timeline for due-process discrepancies."""

    # Jurisdiction-specific rules (simplified; would be configurable per jurisdiction)
    RULES = {
        "notice_timing": {
            "name": "Adequate Notice Period",
            "description": "Property owner must receive notice at least X days before hearing/action",
            "default_days": 10,
            "severity": "critical",
        },
        "hearing_right": {
            "name": "Right to Hearing",
            "description": "Owner must be offered an opportunity to contest before adverse action",
            "severity": "critical",
        },
        "appeal_pathway": {
            "name": "Appeal Pathway Available",
            "description": "Decision must include information on how to appeal",
            "severity": "warning",
        },
        "record_access": {
            "name": "Public Record Accessibility",
            "description": "Relevant records must be accessible via FOIA or public portal",
            "severity": "warning",
        },
        "consistent_application": {
            "name": "Consistent Application",
            "description": "Enforcement actions should be consistent with prior similar cases",
            "severity": "info",
        },
    }

    def analyze(self, evidence_list: List[Any], timeline: List[Any]) -> DueProcessReport:
        flags: List[DueProcessFlag] = []

        # Rule 1: Notice timing
        notice_events = [e for e in timeline if "notice" in e.event_type.lower()]
        action_events = [e for e in timeline if any(x in e.event_type.lower() for x in ["hearing", "decision", "enforcement"])]

        for action in action_events:
            matching_notices = [
                n for n in notice_events 
                if n.receiving_party == action.receiving_party
                and n.event_date <= action.event_date
            ]
            if not matching_notices:
                flags.append(DueProcessFlag(
                    rule_id="notice_timing",
                    rule_name=self.RULES["notice_timing"]["name"],
                    severity="critical",
                    description=f"No prior notice found before {action.event_type} on {action.event_date}",
                    evidence_ids=[str(action.evidence_id)] if action.evidence_id else [],
                    suggested_action="Verify if notice was given through alternative channel",
                ))
            else:
                latest_notice = max(matching_notices, key=lambda n: n.event_date)
                days_diff = (action.event_date - latest_notice.event_date).days
                if days_diff < self.RULES["notice_timing"]["default_days"]:
                    flags.append(DueProcessFlag(
                        rule_id="notice_timing",
                        rule_name=self.RULES["notice_timing"]["name"],
                        severity="warning",
                        description=f"Only {days_diff} days between notice and action (minimum: {self.RULES['notice_timing']['default_days']})",
                        evidence_ids=[str(latest_notice.evidence_id), str(action.evidence_id)] if latest_notice.evidence_id and action.evidence_id else [],
                        suggested_action="Check jurisdiction-specific notice requirements",
                    ))

        # Rule 2: Hearing right
        has_hearing = any("hearing" in e.event_type.lower() for e in timeline)
        has_adverse_action = any(
            x in e.event_type.lower() 
            for e in timeline 
            for x in ["fine", "penalty", "lien", "demolition", "eviction"]
        )
        if has_adverse_action and not has_hearing:
            flags.append(DueProcessFlag(
                rule_id="hearing_right",
                rule_name=self.RULES["hearing_right"]["name"],
                severity="critical",
                description="Adverse action taken without recorded hearing opportunity",
                evidence_ids=[],
                suggested_action="Request hearing transcript or verify administrative waiver",
            ))

        # Rule 3: Appeal pathway
        decision_events = [e for e in timeline if "decision" in e.event_type.lower()]
        for decision in decision_events:
            related_evidence = [ev for ev in evidence_list if ev.id == decision.evidence_id]
            for ev in related_evidence:
                text = (ev.ocr_text or "") + (ev.extracted_markdown or "")
                if "appeal" not in text.lower() and "review" not in text.lower():
                    flags.append(DueProcessFlag(
                        rule_id="appeal_pathway",
                        rule_name=self.RULES["appeal_pathway"]["name"],
                        severity="warning",
                        description=f"Decision on {decision.event_date} does not mention appeal rights",
                        evidence_ids=[str(decision.evidence_id)] if decision.evidence_id else [],
                        suggested_action="Verify appeal rights under local administrative code",
                    ))

        # Calculate score
        critical = sum(1 for f in flags if f.severity == "critical")
        warning = sum(1 for f in flags if f.severity == "warning")
        score = max(0, 100 - critical * 25 - warning * 10)

        summary = f"Analysis complete: {len(flags)} flag(s) found ({critical} critical, {warning} warning)."

        recommendations = []
        if critical > 0:
            recommendations.append("Immediate legal review recommended due to critical due-process flags.")
        if warning > 0:
            recommendations.append("Follow up on warning-level discrepancies with jurisdiction clerk.")
        if len(flags) == 0:
            recommendations.append("No due-process discrepancies detected in available records.")

        return DueProcessReport(
            property_id=str(evidence_list[0].property_id) if evidence_list else "",
            overall_score=score,
            flags=flags,
            summary=summary,
            recommendations=recommendations,
        )
