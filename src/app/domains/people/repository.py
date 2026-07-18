"""People domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import Person
from app.infrastructure.repository import BaseRepository


class PersonRepository(BaseRepository[Person]):
    """Repository for Person model."""

    def __init__(self, session: AsyncSession):
        """Initialize person repository.
        
        Args:
            session: SQLAlchemy async session
        """
        super().__init__(session, Person)

    async def list_by_user(self, user_id: int, skip: int = 0, limit: int | None = None) -> list[Person]:
        """List all people for a user.
        
        Args:
            user_id: User ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of people
        """
        stmt = select(self.model).where(self.model.user_id == user_id).offset(skip)
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()
