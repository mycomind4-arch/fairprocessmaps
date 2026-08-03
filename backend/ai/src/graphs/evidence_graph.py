"""LangGraph workflow for evidence extraction and due-process analysis.

Graph structure:
  ingest → ocr → extract_entities → normalize → link_graph → generate_timeline → analyze_due_process → index
"""
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from operator import add

from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

from src.config import settings


class EvidenceState(TypedDict):
    evidence_id: str
    property_id: str
    raw_text: str
    ocr_text: str
    extracted_entities: Annotated[List[Dict], add]
    extracted_dates: Annotated[List[Dict], add]
    extracted_parties: Annotated[List[Dict], add]
    extracted_violations: Annotated[List[Dict], add]
    extracted_fines: List[Dict]
    normalized: Dict[str, Any]
    timeline_events: Annotated[List[Dict], add]
    due_process_flags: Annotated[List[Dict], add]
    due_process_score: int
    errors: Annotated[List[str], add]


def _get_llm() -> Optional[ChatOpenAI]:
    """Get LLM instance if API key is configured."""
    if not settings.OPENAI_API_KEY:
        return None
    return ChatOpenAI(model="gpt-4o", api_key=settings.OPENAI_API_KEY)


def ocr_node(state: EvidenceState) -> EvidenceState:
    """Run OCR / document parsing. In production, call Docling or Tesseract.
    For API-inline processing, raw_text is already OCR'd text."""
    state["ocr_text"] = state.get("raw_text", "")
    return state


def extract_entities_node(state: EvidenceState) -> EvidenceState:
    """Extract structured entities from document text using LLM."""
    llm = _get_llm()

    if not llm:
        # No API key — skip extraction, preserve raw text
        state["errors"] = ["No OpenAI API key configured — skipping entity extraction"]
        return state

    prompt = f"""You are a legal-document extraction engine. Extract the following from the text below:

1. Parties (names, roles: plaintiff, defendant, property owner, inspector, etc.)
2. Dates (notice date, hearing date, deadline date, decision date)
3. Violations / charges (code section, description, severity)
4. Fines / penalties (amount, type)
5. Locations (address, parcel ID, jurisdiction)

Return ONLY valid JSON in this exact format:
{{
  "parties": [{{"name": "...", "role": "...", "confidence": 0.95}}],
  "dates": [{{"date": "YYYY-MM-DD", "type": "notice|hearing|deadline|decision", "confidence": 0.95}}],
  "violations": [{{"code_section": "...", "description": "...", "severity": "minor|major|critical"}}],
  "fines": [{{"amount": 0, "currency": "USD", "type": "daily|one_time"}}],
  "locations": [{{"address": "...", "parcel_id": "...", "jurisdiction": "..."}}]
}}

Document text:
---
{state["ocr_text"][:8000]}
---
"""
    try:
        response = llm.invoke([SystemMessage(content=prompt)])
        import json
        data = json.loads(response.content)
        state["extracted_entities"] = data.get("parties", []) + data.get("locations", [])
        state["extracted_dates"] = data.get("dates", [])
        state["extracted_parties"] = data.get("parties", [])
        state["extracted_violations"] = data.get("violations", [])
        state["extracted_fines"] = data.get("fines", [])
    except Exception as e:
        state["errors"] = [f"Entity extraction failed: {e}"]
    return state


def normalize_node(state: EvidenceState) -> EvidenceState:
    """Normalize extracted data to canonical schema."""
    normalized = {
        "evidence_type": "code_enforcement_notice",
        "canonical_dates": {},
        "canonical_parties": state.get("extracted_parties", []),
        "canonical_violations": state.get("extracted_violations", []),
        "canonical_fines": state.get("extracted_fines", []),
    }

    for d in state.get("extracted_dates", []):
        if d.get("type") and d.get("date"):
            normalized["canonical_dates"][d["type"]] = d["date"]

    state["normalized"] = normalized
    return state


def link_graph_node(state: EvidenceState) -> EvidenceState:
    """Link evidence to property, parties, and prior events in Neo4j.

    Creates graph relationships:
      (Property)-[:HAS_EVIDENCE]->(Evidence)
      (Evidence)-[:MENTIONS_PARTY]->(Party)
      (Evidence)-[:CITES_VIOLATION]->(Violation)
      (Evidence)-[:OCCURRED_ON]->(Date)
      (Evidence)-[:RELATES_TO]->(PriorEvent)
    """
    try:
        from neo4j import GraphDatabase
        import structlog

        logger = structlog.get_logger("fairprocess.graph")

        driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

        with driver.session() as session:
            # Create evidence node
            session.run(
                """
                MERGE (e:Evidence {id: $evidence_id})
                SET e.type = $evidence_type,
                    e.ocr_text = $ocr_text
                """,
                evidence_id=state.get("evidence_id", ""),
                evidence_type=state.get("normalized", {}).get("evidence_type", ""),
                ocr_text=state.get("ocr_text", "")[:1000],
            )

            # Link to property
            if state.get("property_id"):
                session.run(
                    """
                    MERGE (p:Property {id: $property_id})
                    MERGE (p)-[:HAS_EVIDENCE]->(e:Evidence {id: $evidence_id})
                    """,
                    property_id=state["property_id"],
                    evidence_id=state.get("evidence_id", ""),
                )

            # Link parties
            for party in state.get("extracted_parties", []):
                session.run(
                    """
                    MERGE (party:Party {name: $name})
                    SET party.role = $role
                    MERGE (e:Evidence {id: $evidence_id})-[:MENTIONS_PARTY]->(party)
                    """,
                    name=party.get("name", "Unknown"),
                    role=party.get("role", ""),
                    evidence_id=state.get("evidence_id", ""),
                )

            # Link violations
            for violation in state.get("extracted_violations", []):
                session.run(
                    """
                    MERGE (v:Violation {code_section: $code})
                    SET v.description = $desc, v.severity = $severity
                    MERGE (e:Evidence {id: $evidence_id})-[:CITES_VIOLATION]->(v)
                    """,
                    code=violation.get("code_section", ""),
                    desc=violation.get("description", ""),
                    severity=violation.get("severity", ""),
                    evidence_id=state.get("evidence_id", ""),
                )

        driver.close()
        logger.info(
            "graph_linked",
            evidence_id=state.get("evidence_id"),
            parties=len(state.get("extracted_parties", [])),
            violations=len(state.get("extracted_violations", [])),
        )

    except Exception as e:
        state["errors"] = [f"Graph linking failed: {e}"]

    return state


def generate_timeline_node(state: EvidenceState) -> EvidenceState:
    """Generate timeline events from extracted dates.

    Maps date types to timeline event types:
      notice → notice_issued
      hearing → hearing_scheduled
      deadline → compliance_deadline
      decision → decision_rendered
      appeal → appeal_deadline
    """
    event_type_map = {
        "notice": "notice_issued",
        "hearing": "hearing_scheduled",
        "deadline": "compliance_deadline",
        "decision": "decision_rendered",
        "appeal": "appeal_deadline",
    }

    timeline_events = []
    canonical_dates = state.get("normalized", {}).get("canonical_dates", {})

    for date_type, date_value in canonical_dates.items():
        if not date_value:
            continue

        event_type = event_type_map.get(date_type, "other_event")
        is_critical = event_type in ("notice_issued", "decision_rendered")

        timeline_events.append({
            "event_type": event_type,
            "title": f"{event_type.replace('_', ' ').title()}",
            "event_date": date_value,
            "is_due_process_critical": is_critical,
            "source_text": state.get("ocr_text", "")[:500],
        })

    state["timeline_events"] = timeline_events
    return state


def analyze_due_process_node(state: EvidenceState) -> EvidenceState:
    """Run due-process analysis on the extracted evidence.

    Checks procedural rules and flags discrepancies.
    """
    from src.services.due_process_analyzer import DueProcessAnalyzer

    # Build lightweight evidence and timeline objects for the analyzer
    class _Evidence:
        def __init__(self, d):
            self.id = d.get("evidence_id", "")
            self.property_id = d.get("property_id", "")
            self.ocr_text = d.get("ocr_text", "")
            self.extracted_markdown = d.get("normalized", {}).get("markdown", "")

    class _Timeline:
        def __init__(self, d):
            self.event_type = d.get("event_type", "")
            self.event_date = _parse_date(d.get("event_date"))
            self.evidence_id = None
            self.receiving_party = d.get("receiving_party")

    def _parse_date(s):
        from datetime import datetime
        if not s:
            return datetime.now()
        for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"]:
            try:
                return datetime.strptime(s[:19], fmt)
            except (ValueError, TypeError):
                continue
        return datetime.now()

    evidence_list = [_Evidence(state)]
    timeline = [_Timeline(t) for t in state.get("timeline_events", [])]

    analyzer = DueProcessAnalyzer()
    report = analyzer.analyze(evidence_list, timeline)

    state["due_process_flags"] = [
        {
            "rule_id": f.rule_id,
            "rule_name": f.rule_name,
            "severity": f.severity,
            "description": f.description,
            "evidence_ids": f.evidence_ids,
            "suggested_action": f.suggested_action,
        }
        for f in report.flags
    ]
    state["due_process_score"] = report.overall_score

    return state


def index_node(state: EvidenceState) -> EvidenceState:
    """Index the evidence for Meilisearch full-text search."""
    try:
        from src.services.search_index import SearchIndexService

        svc = SearchIndexService()
        svc.client.index("evidence").add_documents([{
            "id": state.get("evidence_id", ""),
            "title": "Evidence document",
            "ocr_text": state.get("ocr_text", "")[:500],
            "property_id": state.get("property_id", ""),
            "evidence_type": state.get("normalized", {}).get("evidence_type", ""),
            "due_process_score": state.get("due_process_score", 0),
            "due_process_flags": state.get("due_process_flags", []),
        }])
    except Exception as e:
        state["errors"] = [f"Indexing failed: {e}"]

    return state


# ── Build the graph ──

workflow = StateGraph(EvidenceState)

workflow.add_node("ocr", ocr_node)
workflow.add_node("extract_entities", extract_entities_node)
workflow.add_node("normalize", normalize_node)
workflow.add_node("link_graph", link_graph_node)
workflow.add_node("generate_timeline", generate_timeline_node)
workflow.add_node("analyze_due_process", analyze_due_process_node)
workflow.add_node("index", index_node)

workflow.set_entry_point("ocr")
workflow.add_edge("ocr", "extract_entities")
workflow.add_edge("extract_entities", "normalize")
workflow.add_edge("normalize", "link_graph")
workflow.add_edge("link_graph", "generate_timeline")
workflow.add_edge("generate_timeline", "analyze_due_process")
workflow.add_edge("analyze_due_process", "index")
workflow.add_edge("index", END)

evidence_graph = workflow.compile()
