"""Simple migration runner for applying SQL migrations."""

import asyncio
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


async def run_migrations() -> None:
    """Run all pending migrations."""
    settings = get_settings()
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        echo=False
    )
    
    try:
        # Create versions table
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS schema_versions (
                    id INTEGER PRIMARY KEY,
                    migration_name VARCHAR NOT NULL UNIQUE,
                    applied_at DATETIME NOT NULL
                )
            """))
        
        # Check which migrations have been applied
        async with engine.begin() as conn:
            result = await conn.execute(
                text("SELECT migration_name FROM schema_versions")
            )
            applied = {row[0] for row in result.fetchall()}
        
        # Define list of all migrations
        all_migrations = [
            "20260510_relationship_type_fk",
            "20260510_relationship_date_range",
            "20260510_user_settings_base_urls",
        ]
        pending = [m for m in all_migrations if m not in applied]
        
        if not pending:
            print("✓ All migrations already applied")
            return
        
        print(f"Running {len(pending)} pending migration(s)...")
        
        # Apply 20260510_relationship_type_fk migration
        if "20260510_relationship_type_fk" in pending:
            print("\n→ Add relationship_type_id foreign key to PersonRelationship")
            
            async with engine.begin() as conn:
                # Check if column exists
                result = await conn.execute(
                    text("PRAGMA table_info(person_relationships)")
                )
                columns = [row[1] for row in result.fetchall()]
                
                if "relationship_type_id" not in columns:
                    print("  Adding relationship_type_id column...")
                    await conn.execute(
                        text("ALTER TABLE person_relationships ADD COLUMN relationship_type_id INTEGER")
                    )
                else:
                    print("  Column relationship_type_id already exists")
                
                # Migrate data: set relationship_type_id based on name/category match
                print("  Migrating data from relationship_type to relationship_type_id...")
                await conn.execute(text("""
                    UPDATE person_relationships
                    SET relationship_type_id = (
                        SELECT id FROM managed_types 
                        WHERE category = 'relationship' 
                        AND LOWER(name) = LOWER(relationship_type)
                        LIMIT 1
                    )
                    WHERE relationship_type IS NOT NULL AND relationship_type_id IS NULL
                """))
                
                # Record migration
                await conn.execute(text(
                    "INSERT INTO schema_versions (migration_name, applied_at) VALUES (:name, :now)"
                ), {"name": "20260510_relationship_type_fk", "now": datetime.utcnow()})
                
                print("  ✓ Applied")

        # Apply 20260510_relationship_date_range migration
        if "20260510_relationship_date_range" in pending:
            print("\n→ Add start/end date columns to person_relationships")

            async with engine.begin() as conn:
                result = await conn.execute(text("PRAGMA table_info(person_relationships)"))
                columns = [row[1] for row in result.fetchall()]

                if "start_date" not in columns:
                    print("  Adding start_date column...")
                    await conn.execute(
                        text("ALTER TABLE person_relationships ADD COLUMN start_date DATE")
                    )
                else:
                    print("  Column start_date already exists")

                if "end_date" not in columns:
                    print("  Adding end_date column...")
                    await conn.execute(
                        text("ALTER TABLE person_relationships ADD COLUMN end_date DATE")
                    )
                else:
                    print("  Column end_date already exists")

                await conn.execute(text(
                    "INSERT INTO schema_versions (migration_name, applied_at) VALUES (:name, :now)"
                ), {"name": "20260510_relationship_date_range", "now": datetime.utcnow()})

                print("  ✓ Applied")

        # Apply 20260510_user_settings_base_urls migration
        if "20260510_user_settings_base_urls" in pending:
            print("\n→ Add base URL columns to user_settings")

            async with engine.begin() as conn:
                result = await conn.execute(text("PRAGMA table_info(user_settings)"))
                columns = [row[1] for row in result.fetchall()]

                if "immich_base_url" not in columns:
                    print("  Adding immich_base_url column...")
                    await conn.execute(
                        text("ALTER TABLE user_settings ADD COLUMN immich_base_url VARCHAR(512)")
                    )
                else:
                    print("  Column immich_base_url already exists")

                if "home_assistant_base_url" not in columns:
                    print("  Adding home_assistant_base_url column...")
                    await conn.execute(
                        text("ALTER TABLE user_settings ADD COLUMN home_assistant_base_url VARCHAR(512)")
                    )
                else:
                    print("  Column home_assistant_base_url already exists")

                await conn.execute(text(
                    "INSERT INTO schema_versions (migration_name, applied_at) VALUES (:name, :now)"
                ), {"name": "20260510_user_settings_base_urls", "now": datetime.utcnow()})

                print("  ✓ Applied")
        
        print("\n✓ All migrations completed successfully")
    
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_migrations())
