"""Social circles domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.social_circles.schemas import (
    SocialCircleCreateRequest,
    SocialCircleUpdateRequest,
)
from app.infrastructure.models import SocialCircle
from app.infrastructure.exceptions import NotFoundError


class SocialCircleService:
    """Service for managing social circles."""

    def __init__(self, session: AsyncSession):
        """Initialize social circle service."""
        self.session = session

    async def create(self, user_id: int, data: SocialCircleCreateRequest) -> SocialCircle:
        """Create a new social circle."""
        circle = SocialCircle(
            user_id=user_id,
            name=data.name,
            circle_type=data.circle_type,
            description=data.description,
            notes=data.notes,
        )
        self.session.add(circle)
        await self.session.flush()
        await self.session.refresh(circle)
        return circle

    async def get(self, circle_id: int, user_id: int) -> SocialCircle:
        """Get a social circle by ID."""
        stmt = select(SocialCircle).where(
            (SocialCircle.id == circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        circle = result.scalar_one_or_none()

        if not circle:
            raise NotFoundError("Social circle not found")

        return circle

    async def update(
        self, circle_id: int, user_id: int, data: SocialCircleUpdateRequest
    ) -> SocialCircle:
        """Update a social circle."""
        circle = await self.get(circle_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(circle, key, value)

        await self.session.flush()
        await self.session.refresh(circle)
        return circle

    async def delete(self, circle_id: int, user_id: int) -> None:
        """Delete a social circle."""
        circle = await self.get(circle_id, user_id)
        await self.session.delete(circle)
        await self.session.flush()
