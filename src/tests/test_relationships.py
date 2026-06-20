"""Tests for relationship listing behavior."""

import asyncio
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.domains.relationships.router import router as relationships_router
from app.infrastructure.database import Base, get_db
from app.infrastructure.dependencies import get_current_user
from app.infrastructure.models import Person, PersonRelationship, User


def build_relationships_client(relationship_count: int) -> tuple[TestClient, object]:
    """Create an isolated app and database seeded with relationships."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def seed_data() -> int:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with session_factory() as session:
            user = User(
                email="relationships@example.com",
                hashed_password="hashed-password",
                is_active=True,
            )
            session.add(user)
            await session.flush()

            people = [
                Person(user_id=user.id, first_name=f"Person {index}")
                for index in range(relationship_count + 1)
            ]
            session.add_all(people)
            await session.flush()

            session.add_all(
                [
                    PersonRelationship(
                        person_id_1=people[0].id,
                        person_id_2=person.id,
                        relationship_type="friend",
                    )
                    for person in people[1:]
                ]
            )
            await session.commit()
            return user.id

    user_id = asyncio.run(seed_data())

    async def override_get_db():
        async with session_factory() as session:
            yield session

    async def override_current_user():
        return SimpleNamespace(id=user_id)

    app = FastAPI()
    app.include_router(relationships_router, prefix="/api/relationships")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user

    client = TestClient(app)

    async def cleanup() -> None:
        await engine.dispose()

    return client, cleanup


def test_list_relationships_returns_all_records_by_default() -> None:
    """Relationship listing should not stop at the old 100-record default."""
    client, cleanup = build_relationships_client(101)

    try:
        response = client.get("/api/relationships")

        assert response.status_code == 200
        assert len(response.json()) == 101
    finally:
        client.close()
        asyncio.run(cleanup())


def test_list_relationships_keeps_explicit_limiting() -> None:
    """Relationship listing should still honor an explicit client limit."""
    client, cleanup = build_relationships_client(101)

    try:
        response = client.get("/api/relationships", params={"limit": 25})

        assert response.status_code == 200
        assert len(response.json()) == 25
    finally:
        client.close()
        asyncio.run(cleanup())


def test_list_relationships_accepts_large_requested_limits() -> None:
    """Relationship listing should not reject limits above the former cap."""
    client, cleanup = build_relationships_client(101)

    try:
        response = client.get("/api/relationships", params={"limit": 1500})

        assert response.status_code == 200
        assert len(response.json()) == 101
    finally:
        client.close()
        asyncio.run(cleanup())
