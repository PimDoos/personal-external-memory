"""Events domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Event
from app.infrastructure.repository import BaseRepository


class EventRepository(BaseRepository[Event]):
    """Repository for Event model."""

    def __init__(self, session: AsyncSession):
        """Initialize event repository."""
        super().__init__(session, Event)

    async def list_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> list[Event]:
        """List all events for a user."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
