"""Application configuration."""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://fp:fp_dev@localhost:5432/fairprocess"
    VECTOR_DATABASE_URL: str = "postgresql+asyncpg://fp:fp_dev@localhost:5433/fairprocess_vectors"

    # Knowledge Graph
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "fp_dev"

    # Workflow Engine
    TEMPORAL_HOST: str = "localhost:7233"

    # Object Storage
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "fp"
    MINIO_SECRET_KEY: str = "fp_dev_secret"

    # Search
    MEILI_HOST: str = "http://localhost:7700"
    MEILI_API_KEY: str = "fp_dev_key"

    # Auth
    JWT_SECRET: str = "fp_dev_jwt"
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # AI Providers
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Logging
    LOG_LEVEL: str = "INFO"
    JSON_LOGS: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
