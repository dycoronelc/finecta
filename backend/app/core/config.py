from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

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

    # Opcion 1: URL completa
    # MySQL: mysql+pymysql://user:pass@host:3306/finecta?charset=utf8mb4
    # SQLite (desarrollo): sqlite:///./finecta_dev.db
    DATABASE_URL: str = "sqlite:///./finecta_dev.db"
    # Opcion 2: variables separadas (si DATABASE_URL esta vacia)
    DB_DIALECT: str = "mysql+pymysql"
    DB_HOST: str | None = None
    DB_PORT: int = 3306
    DB_NAME: str | None = None
    DB_USER: str | None = None
    DB_PASSWORD: str | None = None
    DB_CHARSET: str = "utf8mb4"

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    UPLOAD_DIR: Path = Path(__file__).resolve().parent.parent.parent / "uploads"

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if all([self.DB_HOST, self.DB_NAME, self.DB_USER, self.DB_PASSWORD]):
            user = quote_plus(self.DB_USER or "")
            password = quote_plus(self.DB_PASSWORD or "")
            return (
                f"{self.DB_DIALECT}://{user}:{password}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"
            )
        return "sqlite:///./finecta_dev.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
