"""Search routes (Meilisearch + PostGIS hybrid)."""
from typing import List
from fastapi import APIRouter, Depends, Query

from src.schemas.search import SearchResult
from src.services.search_index import SearchIndexService

router = APIRouter()


@router.get("", response_model=List[SearchResult])
async def search(
    q: str = Query(..., min_length=1),
    filter_property_type: str = Query(None),
    filter_county: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Full-text search across evidence, properties, and timeline events."""
    svc = SearchIndexService()
    return await svc.search(q, limit=limit, filters={
        "property_type": filter_property_type,
        "county": filter_county,
    })
