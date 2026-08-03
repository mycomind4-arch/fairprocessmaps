"""Specialized AI agents for FairProcess."""
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

from src.config import settings


class DueProcessAgent:
    """Agent specialized in municipal due-process analysis."""

    SYSTEM_PROMPT = """You are a municipal law due-process analyst with expertise in:
- Code enforcement procedures
- Administrative hearings
- Notice requirements
- Appeal pathways
- Public records access (FOIA)
- Equal protection / consistent application

Analyze evidence and timeline data to identify procedural gaps. Be precise about:
- Which statute or ordinance applies
- What the correct procedure should have been
- What remedy is available
- Confidence level in your assessment
"""

    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-4o", api_key=settings.OPENAI_API_KEY, temperature=0.1)

    def analyze(self, case_summary: str, jurisdiction: str = "") -> dict:
        messages = [
            SystemMessage(content=self.SYSTEM_PROMPT),
            SystemMessage(content=f"Jurisdiction: {jurisdiction or 'General US municipal law'}"),
            SystemMessage(content=f"Case summary:
{case_summary}"),
        ]
        response = self.llm.invoke(messages)
        return {"analysis": response.content}


class EntityExtractionAgent:
    """Agent for extracting legal entities from documents."""

    SYSTEM_PROMPT = """Extract structured legal entities from municipal documents.
Focus on: parties, dates, violations, fines, properties, and procedural steps.
Return only valid JSON."""

    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.OPENAI_API_KEY, temperature=0.0)

    def extract(self, document_text: str) -> dict:
        from langchain_core.messages import HumanMessage
        import json

        messages = [
            SystemMessage(content=self.SYSTEM_PROMPT),
            HumanMessage(content=document_text[:12000]),
        ]
        response = self.llm.invoke(messages)
        try:
            return json.loads(response.content)
        except json.JSONDecodeError:
            return {"error": "Failed to parse extraction", "raw": response.content}
