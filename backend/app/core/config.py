from functools import lru_cache
import json
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Raíz del proyecto backend (carpeta que contiene `app/` y suele contener `finecta_dev.db`).
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def _normalize_sqlite_url(url: str) -> str:
    """
    sqlite:///./archivo.db depende del cwd del proceso; en dev suele crear varios .db distintos.
    Las rutas relativas se resuelven siempre respecto a _BACKEND_DIR.
    """
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url
    rest = url[len(prefix) :]
    if rest.startswith(":memory:"):
        return url
    p = Path(rest)
    if p.is_absolute():
        return f"{prefix}{p.as_posix()}"
    abs_p = (_BACKEND_DIR / rest).resolve()
    return f"{prefix}{abs_p.as_posix()}"


def _mysql_connection_url(url: str) -> str:
    """Railway y otros exponen mysql://; SQLAlchemy usa el driver pymysql explícito."""
    u = url.strip()
    if u.startswith("mysql://") and not u.startswith("mysql+pymysql"):
        u = "mysql+pymysql://" + u[len("mysql://") :]
    if u.startswith("mysql+pymysql") and "charset=" not in u:
        sep = "&" if "?" in u else "?"
        u = f"{u}{sep}charset=utf8mb4"
    return u


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

    # Opcion 1: URL completa (mysql, mysql+pymysql o sqlite). None = no usar URL; ver database_url.
    # Railway: a menudo inyecta MYSQL_URL; también acepta DATABASE_URL.
    # MySQL: mysql+pymysql://… o mysql://… (se normaliza a pymysql + charset).
    # SQLite (desarrollo): ruta relativa = relativa a la carpeta backend/ (ver _normalize_sqlite_url)
    DATABASE_URL: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "MYSQL_URL"),
    )
    # Opcion 2: variables separadas (si no hay DATABASE_URL / MYSQL_URL o vienen vacías)
    DB_DIALECT: str = "mysql+pymysql"
    DB_HOST: str | None = None
    DB_PORT: int = 3306
    DB_NAME: str | None = None
    DB_USER: str | None = None
    DB_PASSWORD: str | None = None
    DB_CHARSET: str = "utf8mb4"

    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    UPLOAD_DIR: Path = Path(__file__).resolve().parent.parent.parent / "uploads"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        if v is None or v == "":
            return ["http://localhost:5173", "http://127.0.0.1:5173"]
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return ["http://localhost:5173", "http://127.0.0.1:5173"]
            if s.startswith("["):
                return json.loads(s)
            return [x.strip() for x in s.split(",") if x.strip()]
        return v

    @property
    def database_url(self) -> str:
        raw = (self.DATABASE_URL or "").strip()
        if raw:
            if raw.startswith("sqlite"):
                return _normalize_sqlite_url(raw)
            return _mysql_connection_url(raw)
        if all([self.DB_HOST, self.DB_NAME, self.DB_USER, self.DB_PASSWORD]):
            user = quote_plus(self.DB_USER or "")
            password = quote_plus(self.DB_PASSWORD or "")
            return (
                f"{self.DB_DIALECT}://{user}:{password}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"
            )
        return _normalize_sqlite_url("sqlite:///./finecta_dev.db")


@lru_cache
def get_settings() -> Settings:
    return Settings()
