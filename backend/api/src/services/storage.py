"""MinIO / S3-compatible object storage service."""
import hashlib
import uuid
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from src.config import settings


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        self.bucket = "fairprocess-evidence"
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error:
            pass

    async def upload(self, file: BinaryIO, property_id: str) -> str:
        content = await file.read() if hasattr(file, "read") else file.read()
        ext = (file.filename or "bin").split(".")[-1]
        key = f"{property_id}/{uuid.uuid4()}.{ext}"

        self.client.put_object(
            self.bucket,
            key,
            data=content,
            length=len(content),
            content_type=file.content_type or "application/octet-stream",
        )
        return key

    def get_url(self, key: str, expiry: int = 3600) -> str:
        return self.client.presigned_get_object(self.bucket, key, expires=expiry)
