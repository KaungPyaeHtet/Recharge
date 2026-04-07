from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


def _sqlite_connect_args(url: str) -> dict:
    return {"check_same_thread": False} if url.startswith("sqlite") else {}


engine = create_engine(
    settings.database_url,
    connect_args=_sqlite_connect_args(settings.database_url),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
