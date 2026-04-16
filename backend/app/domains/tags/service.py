"""Tags domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.tags.schemas import TagCreateRequest, TagUpdateRequest
from app.infrastructure.models import Tag, Person
from app.infrastructure.exceptions import NotFoundError, ConflictError


class TagService:
    """Service for managing tags."""

    def __init__(self, session: AsyncSession):
        """Initialize tag service."""
        self.session = session

    async def create(self, user_id: int, data: TagCreateRequest) -> Tag:
        """Create a new tag."""
        tag = Tag(
            user_id=user_id,
            name=data.name,
            description=data.description,
            color=data.color,
        )
        self.session.add(tag)
        await self.session.flush()
        return tag

    async def get(self, tag_id: int, user_id: int) -> Tag:
        """Get a tag by ID."""
        stmt = select(Tag).where((Tag.id == tag_id) & (Tag.user_id == user_id))
        result = await self.session.execute(stmt)
        tag = result.scalar_one_or_none()

        if not tag:
            raise NotFoundError("Tag not found")

        return tag

    async def update(self, tag_id: int, user_id: int, data: TagUpdateRequest) -> Tag:
        """Update a tag."""
        tag = await self.get(tag_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(tag, key, value)

        await self.session.flush()
        return tag

    async def delete(self, tag_id: int, user_id: int) -> None:
        """Delete a tag."""
        tag = await self.get(tag_id, user_id)
        await self.session.delete(tag)
        await self.session.flush()

    async def add_tag_to_person(
        self, person_id: int, tag_id: int, user_id: int
    ) -> None:
        """Add a tag to a person.
        
        Args:
            person_id: Person ID
            tag_id: Tag ID
            user_id: User ID for authorization
            
        Raises:
            NotFoundError: If person or tag not found
            ConflictError: If association already exists
        """
        # Verify ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Verify tag ownership
        await self.get(tag_id, user_id)

        # Check if already associated
        from app.infrastructure.models import PersonTag
        
        stmt = select(PersonTag).where(
            (PersonTag.person_id == person_id) & (PersonTag.tag_id == tag_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Person already has this tag")

        # Create association
        association = PersonTag(person_id=person_id, tag_id=tag_id)
        self.session.add(association)
        await self.session.flush()

    async def remove_tag_from_person(
        self, person_id: int, tag_id: int, user_id: int
    ) -> None:
        """Remove a tag from a person."""
        from app.infrastructure.models import PersonTag
        
        # Verify ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Find and delete association
        stmt = select(PersonTag).where(
            (PersonTag.person_id == person_id) & (PersonTag.tag_id == tag_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()

        if not association:
            raise NotFoundError("Person does not have this tag")

        await self.session.delete(association)
        await self.session.flush()
