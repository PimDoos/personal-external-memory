"""Relationships domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
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


def _orm_to_dict(obj) -> dict:
    """Convert SQLAlchemy ORM object to dict, excluding internal state."""
    if obj is None:
        return None
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


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
    # Populate type_entry for response
    type_entry = None
    if relationship.relationship_type_id:
        from app.infrastructure.models import ManagedType
        stmt = select(ManagedType).where(ManagedType.id == relationship.relationship_type_id)
        result = await db.execute(stmt)
        type_entry = result.scalar_one_or_none()
    resp_data = _orm_to_dict(relationship)
    resp_data["type_entry"] = _orm_to_dict(type_entry) if type_entry else None
    resp = PersonRelationshipResponse.model_validate(resp_data)
    return resp


@router.get("", response_model=list[PersonRelationshipResponse])
async def list_relationships(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[PersonRelationshipResponse]:
    """List all relationships for current user's people."""
    from app.domains.relationships.repository import PersonRelationshipRepository

    repo = PersonRelationshipRepository(db)
    # This is a simplified view - in production, you might want to filter by specific people
    # For now, we return relationships but could add person_id filter
    relationships = await repo.list_all(skip, limit)
    # Populate type_entry for each
    from app.infrastructure.models import ManagedType
    type_ids = {r.relationship_type_id for r in relationships if r.relationship_type_id}
    type_map = {}
    if type_ids:
        stmt = select(ManagedType).where(ManagedType.id.in_(type_ids))
        result = await db.execute(stmt)
        for entry in result.scalars():
            type_map[entry.id] = entry
    resp = []
    for r in relationships:
        resp_data = _orm_to_dict(r)
        resp_data["type_entry"] = _orm_to_dict(type_map.get(r.relationship_type_id)) if r.relationship_type_id in type_map else None
        resp.append(PersonRelationshipResponse.model_validate(resp_data))
    return resp


@router.get("/{relationship_id}", response_model=PersonRelationshipResponse)
async def get_relationship(
    relationship_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonRelationshipResponse:
    """Get a relationship by ID."""
    service = PersonRelationshipService(db)
    relationship = await service.get(relationship_id, current_user.id)
    type_entry = None
    if relationship.relationship_type_id:
        from app.infrastructure.models import ManagedType
        stmt = select(ManagedType).where(ManagedType.id == relationship.relationship_type_id)
        result = await db.execute(stmt)
        type_entry = result.scalar_one_or_none()
    resp_data = _orm_to_dict(relationship)
    resp_data["type_entry"] = _orm_to_dict(type_entry) if type_entry else None
    resp = PersonRelationshipResponse.model_validate(resp_data)
    return resp


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
    type_entry = None
    if relationship.relationship_type_id:
        from app.infrastructure.models import ManagedType
        stmt = select(ManagedType).where(ManagedType.id == relationship.relationship_type_id)
        result = await db.execute(stmt)
        type_entry = result.scalar_one_or_none()
    resp_data = _orm_to_dict(relationship)
    resp_data["type_entry"] = _orm_to_dict(type_entry) if type_entry else None
    resp = PersonRelationshipResponse.model_validate(resp_data)
    return resp


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
