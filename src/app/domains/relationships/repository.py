"""Relationships domain - data access layer."""

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import PersonRelationship
from app.infrastructure.repository import BaseRepository


class PersonRelationshipRepository(BaseRepository[PersonRelationship]):
    """Repository for PersonRelationship model."""

    def __init__(self, session: AsyncSession):
        """Initialize relationship repository."""
        super().__init__(session, PersonRelationship)

    async def list_for_person(
        self, person_id: int, skip: int = 0, limit: int | None = None
    ) -> list[PersonRelationship]:
        """List all relationships for a person (where they are either person_id_1 or person_id_2)."""
        stmt = (
            select(self.model)
            .where(
                or_(
                    self.model.person_id_1 == person_id,
                    self.model.person_id_2 == person_id,
                )
            )
            .offset(skip)
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_relationship_between(
        self, person_id_1: int, person_id_2: int
    ) -> PersonRelationship | None:
        """Get relationship between two people (bidirectional)."""
        stmt = select(self.model).where(
            (
                (self.model.person_id_1 == person_id_1)
                & (self.model.person_id_2 == person_id_2)
            )
            | (
                (self.model.person_id_1 == person_id_2)
                & (self.model.person_id_2 == person_id_1)
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
