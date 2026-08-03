"""Meilisearch hybrid search service."""
from typing import List, Dict, Any, Optional

import meilisearch

from src.config import settings
from src.schemas.search import SearchResult


class SearchIndexService:
    def __init__(self):
        self.client = meilisearch.Client(settings.MEILI_HOST, settings.MEILI_API_KEY)
        self._ensure_indexes()

    def _ensure_indexes(self):
        for idx in ["properties", "evidence", "timeline"]:
            try:
                self.client.create_index(idx, {"primaryKey": "id"})
            except meilisearch.errors.MeilisearchApiError:
                pass

    async def search(
        self, 
        query: str, 
        limit: int = 20,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        filter_str = ""
        if filters:
            parts = []
            for k, v in filters.items():
                if v:
                    parts.append(f"{k} = '{v}'")
            filter_str = " AND ".join(parts)

        results = []
        for idx_name in ["properties", "evidence", "timeline"]:
            try:
                res = self.client.index(idx_name).search(
                    query, 
                    {"limit": limit, "filter": filter_str or None}
                )
                for hit in res.get("hits", []):
                    results.append(SearchResult(
                        id=hit["id"],
                        type=idx_name.rstrip("s"),
                        title=hit.get("title", hit.get("address", "Untitled")),
                        snippet=hit.get("description", hit.get("ocr_text", "")[:200]),
                        score=hit.get("_rankingScore", 0.0),
                        property_id=hit.get("property_id"),
                        evidence_id=hit.get("evidence_id"),
                        highlight=hit.get("_formatted", {}),
                    ))
            except Exception:
                continue

        results.sort(key=lambda r: r.score, reverse=True)
        return results[:limit]

    async def index_document(self, index: str, doc: Dict[str, Any]):
        self.client.index(index).add_documents([doc])
