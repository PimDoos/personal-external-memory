"""People domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.people.schemas import (
    PersonCreateRequest,
    PersonResponse,
    PersonUpdateRequest,
)
from app.domains.people.service import PersonService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser
from app.infrastructure.models import User

router = APIRouter()


@router.post("", response_model=PersonResponse)
async def create_person(
    request: PersonCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """Create a new person.
    
    Args:
        request: Person creation request
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Created person
    """
    service = PersonService(db)
    person = await service.create_person(current_user.id, request)
    await db.commit()
    return person


@router.get("/{person_id}", response_model=PersonResponse)
async def get_person(
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """Get a person by ID.
    
    Args:
        person_id: Person ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Person
    """
    service = PersonService(db)
    return await service.get_person(person_id, current_user.id)


@router.get("", response_model=list[PersonResponse])
async def list_people(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[PersonResponse]:
    """List all people for current user.
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of people
    """
    service = PersonService(db)
    from app.domains.people.repository import PersonRepository
    repo = PersonRepository(db)
    return await repo.list_by_user(current_user.id, skip, limit)


@router.put("/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: int,
    request: PersonUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """Update a person.
    
    Args:
        person_id: Person ID
        request: Update request
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Updated person
    """
    service = PersonService(db)
    person = await service.update_person(person_id, current_user.id, request)
    await db.commit()
    return person


@router.delete("/{person_id}")
async def delete_person(
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a person.
    
    Args:
        person_id: Person ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success response
    """
    service = PersonService(db)
    await service.delete_person(person_id, current_user.id)
    await db.commit()
    return {"message": "Person deleted successfully"}
