"""Relationships domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.relationships.schemas import (
    PersonRelationshipCreateRequest,
    PersonRelationshipUpdateRequest,
)
from app.infrastructure.models import PersonRelationship, Person
from app.infrastructure.exceptions import NotFoundError, ConflictError


class PersonRelationshipService:
    """Service for managing person relationships."""

    def __init__(self, session: AsyncSession):
        """Initialize relationship service."""
        self.session = session

    async def create(
        self, user_id: int, data: PersonRelationshipCreateRequest
    ) -> PersonRelationship:
        """Create a new relationship between two people.
        
        Args:
            user_id: User ID for authorization
            data: Relationship creation data
            
        Returns:
            Created relationship
            
        Raises:
            NotFoundError: If either person not found
            ConflictError: If relationship already exists
        """
        # Verify both people belong to the user
        stmt = select(Person).where(
            (Person.id == data.person_id_1) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person 1 not found")

        stmt = select(Person).where(
            (Person.id == data.person_id_2) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person 2 not found")

        # Cannot have relationship with self
        if data.person_id_1 == data.person_id_2:
            raise ConflictError("Cannot create relationship with the same person")

        # Check if relationship already exists (bidirectional)
        from app.domains.relationships.repository import PersonRelationshipRepository
        repo = PersonRelationshipRepository(self.session)
        existing = await repo.get_relationship_between(
            data.person_id_1, data.person_id_2
        )

        if existing:
            raise ConflictError("Relationship already exists between these people")

        # Create relationship
        relationship = PersonRelationship(
            person_id_1=data.person_id_1,
            person_id_2=data.person_id_2,
            relationship_type=data.relationship_type,
            notes=data.notes,
        )
        self.session.add(relationship)
        await self.session.flush()
        return relationship

    async def get(self, relationship_id: int, user_id: int) -> PersonRelationship:
        """Get a relationship by ID with authorization."""
        stmt = select(PersonRelationship).where(PersonRelationship.id == relationship_id)
        result = await self.session.execute(stmt)
        relationship = result.scalar_one_or_none()

        if not relationship:
            raise NotFoundError("Relationship not found")

        # Verify ownership through both people
        stmt = select(Person).where(
            (Person.id == relationship.person_id_1) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Unauthorized")

        return relationship

    async def update(
        self, relationship_id: int, user_id: int, data: PersonRelationshipUpdateRequest
    ) -> PersonRelationship:
        """Update a relationship."""
        relationship = await self.get(relationship_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(relationship, key, value)

        await self.session.flush()
        return relationship

    async def delete(self, relationship_id: int, user_id: int) -> None:
        """Delete a relationship."""
        relationship = await self.get(relationship_id, user_id)
        await self.session.delete(relationship)
        await self.session.flush()
