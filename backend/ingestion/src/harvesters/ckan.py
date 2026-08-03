"""CKAN-powered open data portal harvester."""
import aiohttp
from typing import AsyncIterator, Dict, Any

from .base import BaseHarvester, RawRecord


class CKANHarvester(BaseHarvester):
    """Harvester for CKAN-powered data portals (data.gov, etc.)."""

    def __init__(self, jurisdiction_id: str, config: Dict[str, Any]):
        super().__init__(jurisdiction_id, config)
        self.base_url = config["base_url"].rstrip("/")
        self.package_id = config["package_id"]

    async def fetch_records(self, since: str = None) -> AsyncIterator[RawRecord]:
        url = f"{self.base_url}/api/3/action/package_show"
        params = {"id": self.package_id}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                resources = data.get("result", {}).get("resources", [])

                for resource in resources:
                    if resource.get("format", "").lower() in ["csv", "json", "geojson"]:
                        yield RawRecord(
                            source_portal=f"ckan:{self.base_url}",
                            source_record_id=resource["id"],
                            source_url=resource.get("url", ""),
                            raw_data=resource,
                            scraped_at="",
                            document_urls=[resource.get("url", "")],
                        )

    async def fetch_document(self, url: str) -> bytes:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                return await resp.read()
