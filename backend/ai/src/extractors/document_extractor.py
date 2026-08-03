"""Document extractors using Docling, Tesseract, and Marker."""
import io
from typing import Optional
from pathlib import Path

from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
from docling.datamodel.document import ConversionResult


class DocumentExtractor:
    """Unified document extraction pipeline."""

    def __init__(self):
        self.converter = DocumentConverter()

    async def extract(self, file_bytes: bytes, mime_type: str) -> dict:
        """Extract text, tables, and structure from a document."""
        result = self.converter.convert(io.BytesIO(file_bytes))

        return {
            "markdown": result.document.export_to_markdown(),
            "text": result.document.export_to_text(),
            "tables": [t.export_to_dataframe().to_dict() for t in result.document.tables],
            "images": len(result.document.pictures),
            "metadata": {
                "title": result.document.name,
                "page_count": len(result.document.pages),
            }
        }


class OCRExtractor:
    """Tesseract-based OCR for image-based PDFs and scans."""

    def __init__(self):
        import pytesseract
        self.pytesseract = pytesseract

    async def extract(self, image_bytes: bytes) -> dict:
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(image_bytes))
        text = self.pytesseract.image_to_string(image)

        return {
            "text": text,
            "confidence": None,  # hOCR would provide per-word confidence
        }
