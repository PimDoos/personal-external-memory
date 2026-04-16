"""Brands domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Brand
from app.infrastructure.repository import BaseRepository


class BrandRepository(BaseRepository[Brand]):
    """Repository for Brand model."""

    def __init__(self, session: AsyncSession):
        """Initialize brand repository."""
        super().__init__(session, Brand)

    async def list_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> list[Brand]:
        """List all brands for a user."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
