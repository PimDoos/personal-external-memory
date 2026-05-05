"""Database initialization and session management."""

from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import text
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
        await _apply_sqlite_migrations(connection)


async def _apply_sqlite_migrations(connection) -> None:
    """Apply lightweight schema updates for SQLite deployments."""
    database_url = settings.DATABASE_URL
    if not database_url.startswith("sqlite"):
        return

    async def add_column_if_missing(table_name: str, column_name: str, column_def: str) -> None:
        result = await connection.execute(text(f"PRAGMA table_info({table_name})"))
        columns = {row[1] for row in result.fetchall()}
        if column_name not in columns:
            await connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))

    async def drop_table_if_exists(table_name: str) -> None:
        await connection.execute(text(f"DROP TABLE IF EXISTS {table_name}"))

    def is_coordinate_pair(value: str) -> bool:
        parts = [part.strip() for part in str(value or "").split(",")]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            return False
        try:
            float(parts[0])
            float(parts[1])
            return True
        except ValueError:
            return False

    def default_location_label(location_value: str) -> str:
        normalized_location = str(location_value or "").strip()
        if not normalized_location:
            return ""

        if is_coordinate_pair(normalized_location):
            parts = [part.strip() for part in normalized_location.split(",")]
            return f"{parts[0]}, {parts[1]}"

        first_part = normalized_location.split(",", maxsplit=1)[0].strip()
        return first_part or normalized_location

    async def location_label_nullable_migration() -> None:
        result = await connection.execute(text("PRAGMA table_info(locations)"))
        columns = result.fetchall()
        if not columns:
            return

        label_info = next((row for row in columns if row[1] == "label"), None)
        if not label_info or not label_info[3]:
            return

        await connection.execute(text("PRAGMA foreign_keys=OFF"))
        await connection.execute(text(
            """
            CREATE TABLE locations__pem_migrated (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                location_type VARCHAR(100),
                label VARCHAR(255),
                location VARCHAR(500) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        ))
        await connection.execute(text(
            """
            INSERT INTO locations__pem_migrated (id, user_id, location_type, label, location, created_at, updated_at)
            SELECT id, user_id, location_type, NULLIF(TRIM(label), ''), location, created_at, updated_at
            FROM locations
            """
        ))
        await connection.execute(text("DROP TABLE locations"))
        await connection.execute(text("ALTER TABLE locations__pem_migrated RENAME TO locations"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_locations_id ON locations (id)"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_locations_user_id ON locations (user_id)"))
        await connection.execute(text("PRAGMA foreign_keys=ON"))

    async def migrate_event_location_strings_to_locations() -> None:
        result = await connection.execute(text("PRAGMA table_info(events)"))
        event_columns = {row[1] for row in result.fetchall()}
        if "location" not in event_columns:
            return

        result = await connection.execute(text(
            """
            SELECT id, user_id, location
            FROM events
            WHERE location IS NOT NULL AND TRIM(location) <> ''
            """
        ))
        event_rows = result.fetchall()
        if not event_rows:
            return

        for event_id, user_id, raw_location in event_rows:
            normalized_location = str(raw_location).strip()
            if not normalized_location:
                continue

            existing_location_result = await connection.execute(
                text(
                    """
                    SELECT id
                    FROM locations
                    WHERE user_id = :user_id
                      AND LOWER(TRIM(location)) = LOWER(:location)
                    ORDER BY id ASC
                    LIMIT 1
                    """
                ),
                {"user_id": user_id, "location": normalized_location},
            )
            location_id = existing_location_result.scalar_one_or_none()

            if location_id is None:
                default_label = default_location_label(normalized_location)
                insert_location_result = await connection.execute(
                    text(
                        """
                        INSERT INTO locations (user_id, location_type, label, location)
                        VALUES (:user_id, NULL, :label, :location)
                        """
                    ),
                    {"user_id": user_id, "label": default_label, "location": normalized_location},
                )
                location_id = insert_location_result.lastrowid

            association_exists_result = await connection.execute(
                text(
                    """
                    SELECT id
                    FROM location_associations
                    WHERE location_id = :location_id
                      AND entity_type = 'event'
                      AND entity_id = :event_id
                    LIMIT 1
                    """
                ),
                {"location_id": location_id, "event_id": event_id},
            )
            association_exists = association_exists_result.scalar_one_or_none()

            if association_exists is None:
                await connection.execute(
                    text(
                        """
                        INSERT INTO location_associations (location_id, entity_type, entity_id)
                        VALUES (:location_id, 'event', :event_id)
                        """
                    ),
                    {"location_id": location_id, "event_id": event_id},
                )

            await connection.execute(
                text("UPDATE events SET location = NULL WHERE id = :event_id"),
                {"event_id": event_id},
            )

    async def backfill_missing_location_labels() -> None:
        result = await connection.execute(text(
            """
            SELECT id, location
            FROM locations
            WHERE label IS NULL OR TRIM(label) = ''
            """
        ))
        rows = result.fetchall()
        if not rows:
            return

        for location_id, location_value in rows:
            label = default_location_label(location_value)
            if not label:
                continue
            await connection.execute(
                text("UPDATE locations SET label = :label WHERE id = :id"),
                {"id": location_id, "label": label},
            )

    async def drop_legacy_event_location_column() -> None:
        result = await connection.execute(text("PRAGMA table_info(events)"))
        columns = result.fetchall()
        if not columns:
            return

        column_names = {row[1] for row in columns}
        if "location" not in column_names:
            return

        await connection.execute(text("PRAGMA foreign_keys=OFF"))
        await connection.execute(text(
            """
            CREATE TABLE events__pem_migrated (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title VARCHAR(255),
                event_type VARCHAR(100),
                date DATETIME NOT NULL,
                start_time DATETIME,
                end_time DATETIME,
                notes TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        ))
        await connection.execute(text(
            """
            INSERT INTO events__pem_migrated (id, user_id, title, event_type, date, start_time, end_time, notes, created_at, updated_at)
            SELECT id, user_id, title, event_type, date, start_time, end_time, notes, created_at, updated_at
            FROM events
            """
        ))
        await connection.execute(text("DROP TABLE events"))
        await connection.execute(text("ALTER TABLE events__pem_migrated RENAME TO events"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_events_id ON events (id)"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_events_user_id ON events (user_id)"))
        await connection.execute(text("PRAGMA foreign_keys=ON"))

    await add_column_if_missing("events", "title", "VARCHAR(255)")
    await add_column_if_missing("events", "event_type", "VARCHAR(100)")
    await add_column_if_missing("social_circles", "circle_type", "VARCHAR(100)")
    await add_column_if_missing("people", "date_of_death", "DATE")
    await add_column_if_missing("locations", "latitude", "FLOAT")
    await add_column_if_missing("locations", "longitude", "FLOAT")
    await add_column_if_missing("locations", "geocode_status", "VARCHAR(32)")
    await add_column_if_missing("locations", "geocoded_at", "DATETIME")
    
    # Ensure social_circle_associations table exists
    table_check_result = await connection.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='social_circle_associations'"
    ))
    if not table_check_result.scalar():
        await connection.execute(text(
            """
            CREATE TABLE social_circle_associations (
                id INTEGER PRIMARY KEY,
                circle_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                FOREIGN KEY(circle_id) REFERENCES social_circles(id),
                FOREIGN KEY(event_id) REFERENCES events(id),
                UNIQUE(circle_id, event_id)
            )
            """
        ))
        await connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_social_circle_associations_circle_id ON social_circle_associations (circle_id)"
        ))
        await connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_social_circle_associations_event_id ON social_circle_associations (event_id)"
        ))
    
    await location_label_nullable_migration()
    await migrate_event_location_strings_to_locations()
    await backfill_missing_location_labels()
    await drop_legacy_event_location_column()

    # Interactions were consolidated into events and can be safely removed.
    await drop_table_if_exists("interaction_participants")
    await drop_table_if_exists("interactions")


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
