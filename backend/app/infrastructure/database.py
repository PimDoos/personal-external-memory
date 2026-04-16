"""Database initialization and session management."""

from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

# Create async session factory
async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, future=True
)

# Base class for all models
Base = declarative_base()


def _ensure_sqlite_directory_exists() -> None:
    """Create parent directory for file-based SQLite databases when needed."""
    database_url = settings.DATABASE_URL
    if not database_url.startswith("sqlite"):
        return

    # sqlite+aiosqlite:///./pem.db or sqlite+aiosqlite:////app/data/pem.db
    if "///" not in database_url:
        return

    database_path = database_url.split("///", maxsplit=1)[1]
    if not database_path or database_path == ":memory:":
        return

    Path(database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


async def init_db() -> None:
    """Initialize database schema for first-time startup."""
    _ensure_sqlite_directory_exists()

    # Import models so metadata is populated before table creation.
    from app.infrastructure import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose engine connections on application shutdown."""
    await engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting a database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
