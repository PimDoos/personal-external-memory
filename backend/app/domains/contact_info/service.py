"""Contact Info domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.contact_info.schemas import (
    ContactInfoCreateRequest,
    ContactInfoUpdateRequest,
)
from app.infrastructure.models import ContactInfo, Person
from app.infrastructure.exceptions import NotFoundError


class ContactInfoService:
    """Service for managing contact information."""

    def __init__(self, session: AsyncSession):
        """Initialize contact info service."""
        self.session = session

    async def create(self, data: ContactInfoCreateRequest, user_id: int) -> ContactInfo:
        """Create new contact info for a person.
        
        Args:
            data: Contact info creation data
            user_id: User ID for authorization
            
        Returns:
            Created contact info
            
        Raises:
            NotFoundError: If person not found
        """
        # Verify person belongs to user
        stmt = select(Person).where(
            (Person.id == data.person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        contact_info = ContactInfo(
            person_id=data.person_id,
            contact_type=data.contact_type,
            value=data.value,
        )
        self.session.add(contact_info)
        await self.session.flush()
        return contact_info

    async def get(self, contact_id: int, user_id: int) -> ContactInfo:
        """Get contact info by ID with authorization."""
        stmt = select(ContactInfo).where(ContactInfo.id == contact_id)
        result = await self.session.execute(stmt)
        contact_info = result.scalar_one_or_none()

        if not contact_info:
            raise NotFoundError("Contact info not found")

        # Verify ownership through person
        stmt = select(Person).where(
            (Person.id == contact_info.person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Unauthorized")

        return contact_info

    async def update(
        self, contact_id: int, user_id: int, data: ContactInfoUpdateRequest
    ) -> ContactInfo:
        """Update contact info."""
        contact_info = await self.get(contact_id, user_id)

        contact_info.contact_type = data.contact_type
        contact_info.value = data.value

        await self.session.flush()
        return contact_info

    async def delete(self, contact_id: int, user_id: int) -> None:
        """Delete contact info."""
        contact_info = await self.get(contact_id, user_id)
        await self.session.delete(contact_info)
        await self.session.flush()
