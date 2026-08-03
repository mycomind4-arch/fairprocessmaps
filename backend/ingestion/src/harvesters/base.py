"""Base class for county data harvesters."""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, Any
from dataclasses import dataclass


@dataclass
class RawRecord:
    """A raw record scraped from a county portal."""
    source_portal: str
    source_record_id: str
    source_url: str
    raw_data: Dict[str, Any]
    scraped_at: str
    document_urls: list[str]


class BaseHarvester(ABC):
    """Abstract base for all county/public data harvesters."""

    def __init__(self, jurisdiction_id: str, config: Dict[str, Any]):
        self.jurisdiction_id = jurisdiction_id
        self.config = config

    @abstractmethod
    async def fetch_records(self, since: str = None) -> AsyncIterator[RawRecord]:
        """Yield raw records from the source."""
        raise NotImplementedError

    @abstractmethod
    async def fetch_document(self, url: str) -> bytes:
        """Fetch a binary document from the source."""
        raise NotImplementedError

    async def health_check(self) -> bool:
        """Check if the source is accessible."""
        return True
