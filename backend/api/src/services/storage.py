"""MinIO / S3-compatible object storage service."""
import hashlib
import uuid
from typing import BinaryIO, Optional

from minio import Minio
from minio.error import S3Error

from src.config import settings
import structlog

logger = structlog.get_logger("fairprocess.storage")


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
        except S3Error as e:
            logger.warning("bucket_check_failed", error=str(e))

    async def upload(self, file: BinaryIO, property_id: str) -> str:
        """Upload a file and return its storage key."""
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

        # Compute checksum for audit trail
        checksum = hashlib.sha256(content).hexdigest()
        logger.info(
            "file_uploaded",
            key=key,
            size=len(content),
            checksum=checksum,
            property_id=property_id,
        )

        return key

    def get_object(self, key: str) -> bytes:
        """Fetch a stored object's content as bytes."""
        response = self.client.get_object(self.bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_url(self, key: str, expiry: int = 3600) -> str:
        """Generate a presigned download URL."""
        return self.client.presigned_get_object(self.bucket, key, expires=expiry)

    def delete_object(self, key: str):
        """Remove a stored object."""
        self.client.remove_object(self.bucket, key)
        logger.info("file_deleted", key=key)

    def list_objects(self, prefix: str) -> list:
        """List objects under a prefix (e.g. property_id/)."""
        return list(self.client.list_objects(self.bucket, prefix=prefix, recursive=True))
