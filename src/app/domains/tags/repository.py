"""Tags domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Tag, PersonTag
from app.infrastructure.repository import BaseRepository


class TagRepository(BaseRepository[Tag]):
    """Repository for Tag model."""

    def __init__(self, session: AsyncSession):
        """Initialize tag repository."""
        super().__init__(session, Tag)

    async def list_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> list[Tag]:
        """List all tags for a user."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()


class PersonTagRepository(BaseRepository[PersonTag]):
    """Repository for PersonTag association model."""

    def __init__(self, session: AsyncSession):
        """Initialize person tag repository."""
        super().__init__(session, PersonTag)

    async def list_tags_for_person(self, person_id: int) -> list[Tag]:
        """Get all tags for a person."""
        stmt = (
            select(Tag)
            .join(PersonTag, PersonTag.tag_id == Tag.id)
            .where(PersonTag.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_people_with_tag(self, tag_id: int) -> list[int]:
        """Get all person IDs with a specific tag."""
        stmt = select(PersonTag.person_id).where(PersonTag.tag_id == tag_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def is_person_tagged(self, person_id: int, tag_id: int) -> bool:
        """Check if a person has a specific tag."""
        stmt = select(PersonTag).where(
            (PersonTag.person_id == person_id) & (PersonTag.tag_id == tag_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def add_tag_to_person(self, person_id: int, tag_id: int) -> PersonTag:
        """Add a tag to a person."""
        association = PersonTag(person_id=person_id, tag_id=tag_id)
        self.session.add(association)
        await self.session.flush()
        return association

    async def remove_tag_from_person(self, person_id: int, tag_id: int) -> None:
        """Remove a tag from a person."""
        stmt = select(PersonTag).where(
            (PersonTag.person_id == person_id) & (PersonTag.tag_id == tag_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()
        if association:
            await self.session.delete(association)
            await self.session.flush()
