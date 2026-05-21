"""Contact Info domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import ContactInfo
from app.infrastructure.repository import BaseRepository


class ContactInfoRepository(BaseRepository[ContactInfo]):
    """Repository for ContactInfo model."""

    def __init__(self, session: AsyncSession):
        """Initialize contact info repository."""
        super().__init__(session, ContactInfo)

    async def list_by_person(
        self, person_id: int, skip: int = 0, limit: int = 100
    ) -> list[ContactInfo]:
        """List all contact info for a person."""
        stmt = (
            select(self.model)
            .where(self.model.person_id == person_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def delete_by_person_and_type(self, person_id: int, contact_type: str) -> None:
        """Delete all contact info of a specific type for a person."""
        stmt = select(self.model).where(
            (self.model.person_id == person_id)
            & (self.model.contact_type == contact_type)
        )
        result = await self.session.execute(stmt)
        for contact_info in result.scalars().all():
            await self.session.delete(contact_info)
        await self.session.flush()
