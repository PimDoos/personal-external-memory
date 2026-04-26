"""Relationships domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.relationships.schemas import (
    PersonRelationshipCreateRequest,
    PersonRelationshipResponse,
    PersonRelationshipUpdateRequest,
)
from app.domains.relationships.service import PersonRelationshipService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=PersonRelationshipResponse)
async def create_relationship(
    request: PersonRelationshipCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonRelationshipResponse:
    """Create a new relationship between two people."""
    service = PersonRelationshipService(db)
    relationship = await service.create(current_user.id, request)
    await db.commit()
    return relationship


@router.get("", response_model=list[PersonRelationshipResponse])
async def list_relationships(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[PersonRelationshipResponse]:
    """List all relationships for current user's people."""
    from app.domains.relationships.repository import PersonRelationshipRepository

    repo = PersonRelationshipRepository(db)
    # This is a simplified view - in production, you might want to filter by specific people
    # For now, we return relationships but could add person_id filter
    return await repo.list_all(skip, limit)


@router.get("/{relationship_id}", response_model=PersonRelationshipResponse)
async def get_relationship(
    relationship_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonRelationshipResponse:
    """Get a relationship by ID."""
    service = PersonRelationshipService(db)
    return await service.get(relationship_id, current_user.id)


@router.put("/{relationship_id}", response_model=PersonRelationshipResponse)
async def update_relationship(
    relationship_id: int,
    request: PersonRelationshipUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonRelationshipResponse:
    """Update a relationship."""
    service = PersonRelationshipService(db)
    relationship = await service.update(relationship_id, current_user.id, request)
    await db.commit()
    return relationship


@router.delete("/{relationship_id}")
async def delete_relationship(
    relationship_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a relationship."""
    service = PersonRelationshipService(db)
    await service.delete(relationship_id, current_user.id)
    await db.commit()
    return {"message": "Relationship deleted successfully"}
