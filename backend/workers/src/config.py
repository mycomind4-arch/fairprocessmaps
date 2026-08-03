"""Worker configuration."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TEMPORAL_HOST: str = "localhost:7233"
    DATABASE_URL: str = "postgresql+asyncpg://fp:fp_dev@localhost:5432/fairprocess"
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "fp_dev"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "fp"
    MINIO_SECRET_KEY: str = "fp_dev_secret"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
