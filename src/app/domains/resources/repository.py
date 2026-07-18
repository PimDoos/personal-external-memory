"""Resources domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Resource
from app.infrastructure.repository import BaseRepository


class ResourceRepository(BaseRepository[Resource]):
    """Repository for Resource model."""

    def __init__(self, session: AsyncSession):
        """Initialize resource repository."""
        super().__init__(session, Resource)

    async def list_by_entity(
        self, entity_type: str, entity_id: int, skip: int = 0, limit: int | None = None
    ) -> list[Resource]:
        """List all resources for an entity."""
        stmt = (
            select(self.model)
            .where(
                (self.model.entity_type == entity_type)
                & (self.model.entity_id == entity_id)
            )
            .offset(skip)
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()
