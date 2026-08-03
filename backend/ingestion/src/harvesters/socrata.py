"""Socrata Open Data API harvester.

Harvests code enforcement, permits, and violations from Socrata portals.
"""
import aiohttp
from typing import AsyncIterator, Dict, Any

from .base import BaseHarvester, RawRecord


class SocrataHarvester(BaseHarvester):
    """Harvester for Socrata-powered open data portals."""

    BASE_URL = "https://{domain}/resource/{dataset_id}.json"

    def __init__(self, jurisdiction_id: str, config: Dict[str, Any]):
        super().__init__(jurisdiction_id, config)
        self.domain = config["domain"]  # e.g. "data.oaklandca.gov"
        self.dataset_id = config["dataset_id"]
        self.app_token = config.get("app_token")

    async def fetch_records(self, since: str = None) -> AsyncIterator[RawRecord]:
        url = self.BASE_URL.format(domain=self.domain, dataset_id=self.dataset_id)
        headers = {"X-App-Token": self.app_token} if self.app_token else {}

        params = {"$limit": 1000, "$offset": 0}
        if since:
            params["$where"] = f"date > '{since}'"

        async with aiohttp.ClientSession() as session:
            while True:
                async with session.get(url, headers=headers, params=params) as resp:
                    if resp.status != 200:
                        break
                    data = await resp.json()
                    if not data:
                        break

                    for record in data:
                        yield RawRecord(
                            source_portal=f"socrata:{self.domain}",
                            source_record_id=str(record.get("id", record.get("case_number", ""))),
                            source_url=f"{url}?{record.get('id', '')}",
                            raw_data=record,
                            scraped_at="",  # set by caller
                            document_urls=[],
                        )

                    params["$offset"] += params["$limit"]

    async def fetch_document(self, url: str) -> bytes:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                return await resp.read()
