"""LangGraph workflow for evidence extraction and due-process analysis.

Graph structure:
  ingest → ocr → extract_entities → normalize → link_graph → generate_timeline → analyze_due_process → index
"""
from typing import TypedDict, Annotated, List, Dict, Any
from operator import add

from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

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
    normalized: Dict[str, Any]
    timeline_events: Annotated[List[Dict], add]
    due_process_flags: Annotated[List[Dict], add]
    due_process_score: int
    errors: Annotated[List[str], add]


llm = ChatOpenAI(model="gpt-4o", api_key=settings.OPENAI_API_KEY)


def ocr_node(state: EvidenceState) -> EvidenceState:
    """Run OCR / document parsing."""
    # In production: call Docling or Tesseract
    # For now, assume raw_text is already OCR'd
    state["ocr_text"] = state.get("raw_text", "")
    return state


def extract_entities_node(state: EvidenceState) -> EvidenceState:
    """Extract structured entities from document text."""
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
    # Map extracted types to canonical evidence types
    normalized = {
        "evidence_type": "code_enforcement_notice",  # inferred from content
        "canonical_dates": {},
        "canonical_parties": {},
        "canonical_violations": state["extracted_violations"],
        "canonical_fines": state["extracted_fines"],
    }

    for d in state["extracted_dates"]:
        normalized["canonical_dates"][d["type"]] = d["date"]

    state["normalized"] = normalized
    return state


def link_graph_node(state: EvidenceState) -> EvidenceState:
    """Link entities to knowledge graph (Neo4j)."""
    # In production: write nodes/edges to Neo4j
    # CREATE (e:Evidence {{id: $evidence_id}})
    # CREATE (p:Property {{id: $property_id}})
    # CREATE (e)-[:CONCERNS]->(p)
    # ...
    return state


def generate_timeline_node(state: EvidenceState) -> EvidenceState:
    """Generate timeline events from normalized data."""
    events = []
    dates = state["normalized"].get("canonical_dates", {})

    if "notice" in dates:
        events.append({
            "event_type": "notice_issued",
            "event_date": dates["notice"],
            "title": "Notice Issued",
            "is_due_process_critical": True,
        })
    if "hearing" in dates:
        events.append({
            "event_type": "hearing_scheduled",
            "event_date": dates["hearing"],
            "title": "Hearing Scheduled",
            "is_due_process_critical": True,
        })
    if "deadline" in dates:
        events.append({
            "event_type": "compliance_deadline",
            "event_date": dates["deadline"],
            "title": "Compliance Deadline",
            "is_due_process_critical": True,
        })
    if "decision" in dates:
        events.append({
            "event_type": "decision_rendered",
            "event_date": dates["decision"],
            "title": "Decision Rendered",
            "is_due_process_critical": True,
        })

    state["timeline_events"] = events
    return state


def analyze_due_process_node(state: EvidenceState) -> EvidenceState:
    """Run due-process analysis via LLM."""
    prompt = f"""You are a municipal law due-process analyst. Review the following case summary and identify any potential due-process discrepancies.

Case summary:
- Document type: {state["normalized"].get("evidence_type", "unknown")}
- Dates: {state["normalized"].get("canonical_dates", {})}
- Parties: {state["extracted_parties"]}
- Violations: {state["extracted_violations"]}
- Fines: {state["extracted_fines"]}

Check for:
1. Was proper notice given? (time, method, content)
2. Was a hearing offered? (right to contest)
3. Was the decision appealable? (pathways, deadlines)
4. Were records accessible? (FOIA / public data)
5. Was the process consistent with similar cases?

Return ONLY valid JSON:
{{
  "score": 0-100,
  "flags": [
    {{
      "rule_id": "...",
      "rule_name": "...",
      "severity": "critical|warning|info",
      "description": "...",
      "suggested_action": "..."
    }}
  ]
}}
"""
    try:
        response = llm.invoke([SystemMessage(content=prompt)])
        import json
        data = json.loads(response.content)
        state["due_process_score"] = data.get("score", 50)
        state["due_process_flags"] = data.get("flags", [])
    except Exception as e:
        state["errors"] = state.get("errors", []) + [f"Due-process analysis failed: {e}"]
        state["due_process_score"] = 0
    return state


# Build graph
builder = StateGraph(EvidenceState)
builder.add_node("ocr", ocr_node)
builder.add_node("extract_entities", extract_entities_node)
builder.add_node("normalize", normalize_node)
builder.add_node("link_graph", link_graph_node)
builder.add_node("generate_timeline", generate_timeline_node)
builder.add_node("analyze_due_process", analyze_due_process_node)

builder.set_entry_point("ocr")
builder.add_edge("ocr", "extract_entities")
builder.add_edge("extract_entities", "normalize")
builder.add_edge("normalize", "link_graph")
builder.add_edge("link_graph", "generate_timeline")
builder.add_edge("generate_timeline", "analyze_due_process")
builder.add_edge("analyze_due_process", END)

evidence_graph = builder.compile()
