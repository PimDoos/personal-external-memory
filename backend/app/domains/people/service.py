"""People domain - business logic."""

from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.people.schemas import PersonCreateRequest, PersonUpdateRequest
from app.infrastructure.models import Person
from app.infrastructure.exceptions import NotFoundError


class PersonService:
    """Service for managing people."""

    def __init__(self, session: AsyncSession):
        """Initialize person service.
        
        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def create_person(
        self, user_id: int, data: PersonCreateRequest
    ) -> Person:
        """Create a new person.
        
        Args:
            user_id: User ID (owner)
            data: Person creation data
            
        Returns:
            Created person
        """
        person = Person(
            user_id=user_id,
            first_name=data.first_name,
            last_name=data.last_name,
            birth_date=data.birth_date,
            date_of_death=data.date_of_death,
            notes=data.notes,
        )
        self.session.add(person)
        await self.session.flush()
        await self.session.refresh(person)
        return person

    async def get_person(self, person_id: int, user_id: int) -> Person:
        """Get a person by ID.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            
        Returns:
            Person
            
        Raises:
            NotFoundError: If person not found
        """
        from sqlalchemy import select
        
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        person = result.scalar_one_or_none()
        
        if not person:
            raise NotFoundError("Person not found")
        
        return person

    async def update_person(
        self, person_id: int, user_id: int, data: PersonUpdateRequest
    ) -> Person:
        """Update a person.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            data: Update data
            
        Returns:
            Updated person
            
        Raises:
            NotFoundError: If person not found
        """
        person = await self.get_person(person_id, user_id)
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(person, key, value)
        
        await self.session.flush()
        await self.session.refresh(person)
        return person

    async def delete_person(self, person_id: int, user_id: int) -> None:
        """Delete a person.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            
        Raises:
            NotFoundError: If person not found
        """
        person = await self.get_person(person_id, user_id)
        await self.session.delete(person)
        await self.session.flush()
