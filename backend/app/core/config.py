from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "Finecta API"
    API_V1: str = "/api/v1"

    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # MySQL: mysql+pymysql://user:pass@host:3306/finecta?charset=utf8mb4
    # SQLite (desarrollo): sqlite:///./finecta_dev.db
    DATABASE_URL: str = "sqlite:///./finecta_dev.db"

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    UPLOAD_DIR: Path = Path(__file__).resolve().parent.parent.parent / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
