"""Worker configuration."""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://fp:fp_dev@localhost:5432/fairprocess"
    VECTOR_DATABASE_URL: str = "postgresql+asyncpg://fp:fp_dev@localhost:5433/fairprocess_vectors"
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "fp_dev"
    TEMPORAL_HOST: str = "localhost:7233"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "fp"
    MINIO_SECRET_KEY: str = "fp_dev_secret"
    MEILI_HOST: str = "http://localhost:7700"
    MEILI_API_KEY: str = "fp_dev_key"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LOG_LEVEL: str = "INFO"
    JSON_LOGS: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
