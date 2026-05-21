"""Base repository class with common CRUD operations."""

from typing import Generic, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.exceptions import NotFoundError

T = TypeVar("T")


class BaseRepository(Generic[T]):
    """Base repository providing common CRUD operations."""

    def __init__(self, session: AsyncSession, model: Type[T]):
        """Initialize repository.
        
        Args:
            session: SQLAlchemy async session
            model: SQLAlchemy model class
        """
        self.session = session
        self.model = model

    async def get(self, id: int) -> T:
        """Get a record by ID.
        
        Args:
            id: Record ID
            
        Returns:
            Record if found
            
        Raises:
            NotFoundError: If record not found
        """
        stmt = select(self.model).where(self.model.id == id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        
        if not record:
            raise NotFoundError(f"{self.model.__name__} with id {id} not found")
        
        return record

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[T]:
        """List all records with pagination.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of records
        """
        stmt = select(self.model).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, **data) -> T:
        """Create a new record.
        
        Args:
            **data: Data for the new record
            
        Returns:
            Created record
        """
        record = self.model(**data)
        self.session.add(record)
        await self.session.flush()
        return record

    async def update(self, id: int, **data) -> T:
        """Update a record.
        
        Args:
            id: Record ID
            **data: Data to update
            
        Returns:
            Updated record
            
        Raises:
            NotFoundError: If record not found
        """
        record = await self.get(id)
        
        for key, value in data.items():
            if hasattr(record, key):
                setattr(record, key, value)
        
        await self.session.flush()
        return record

    async def delete(self, id: int) -> None:
        """Delete a record.
        
        Args:
            id: Record ID
            
        Raises:
            NotFoundError: If record not found
        """
        record = await self.get(id)
        await self.session.delete(record)
        await self.session.flush()
