"""Social circles domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import SocialCircle
from app.infrastructure.repository import BaseRepository


class SocialCircleRepository(BaseRepository[SocialCircle]):
    """Repository for SocialCircle model."""

    def __init__(self, session: AsyncSession):
        """Initialize social circle repository."""
        super().__init__(session, SocialCircle)

    async def list_by_user(
        self, user_id: int, skip: int = 0, limit: int | None = None
    ) -> list[SocialCircle]:
        """List all social circles for a user."""
        stmt = select(self.model).where(self.model.user_id == user_id).offset(skip)
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()
