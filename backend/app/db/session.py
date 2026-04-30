from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()
_k = {}
db_url = settings.database_url
if db_url.startswith("sqlite"):
    _k = {"connect_args": {"check_same_thread": False}}
else:
    _k = {"pool_pre_ping": True, "pool_recycle": 3600}
engine = create_engine(db_url, **_k)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
