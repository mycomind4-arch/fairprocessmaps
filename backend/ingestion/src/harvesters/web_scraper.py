"""Playwright-based web scraper for non-API county portals."""
from typing import AsyncIterator, Dict, Any, List
from playwright.async_api import async_playwright

from .base import BaseHarvester, RawRecord


class WebScraperHarvester(BaseHarvester):
    """Scraper for county portals without public APIs."""

    def __init__(self, jurisdiction_id: str, config: Dict[str, Any]):
        super().__init__(jurisdiction_id, config)
        self.portal_url = config["portal_url"]
        self.search_selector = config.get("search_selector", "input[type='search']")
        self.row_selector = config.get("row_selector", "tr")

    async def fetch_records(self, since: str = None) -> AsyncIterator[RawRecord]:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(self.portal_url)

            # Wait for table to load
            await page.wait_for_selector(self.row_selector, timeout=30000)

            rows = await page.query_selector_all(self.row_selector)
            for row in rows[1:]:  # skip header
                cells = await row.query_selector_all("td")
                if len(cells) < 3:
                    continue

                data = {}
                for i, cell in enumerate(cells):
                    text = await cell.inner_text()
                    data[f"col_{i}"] = text.strip()

                yield RawRecord(
                    source_portal=f"web:{self.portal_url}",
                    source_record_id=data.get("col_0", ""),
                    source_url=self.portal_url,
                    raw_data=data,
                    scraped_at="",
                    document_urls=[],
                )

            await browser.close()

    async def fetch_document(self, url: str) -> bytes:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            response = await page.goto(url)
            body = await response.body()
            await browser.close()
            return body
