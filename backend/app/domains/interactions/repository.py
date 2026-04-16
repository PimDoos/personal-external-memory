"""Interactions domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Interaction
from app.infrastructure.repository import BaseRepository


class InteractionRepository(BaseRepository[Interaction]):
    """Repository for Interaction model."""

    def __init__(self, session: AsyncSession):
        """Initialize interaction repository."""
        super().__init__(session, Interaction)

    async def list_by_user(
        self, user_id: int, skip: int = 0, limit: int = 100
    ) -> list[Interaction]:
        """List all interactions for a user."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
