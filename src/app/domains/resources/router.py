"""Resources domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.resources.schemas import (
    ResourceCreateRequest,
    ResourceResponse,
)
from app.domains.resources.service import ResourceService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=ResourceResponse)
async def create_resource(
    request: ResourceCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResourceResponse:
    """Create a new resource."""
    service = ResourceService(db)
    resource = await service.create(request)
    await db.commit()
    return resource


@router.get("/by-entity/{entity_type}/{entity_id}", response_model=list[ResourceResponse])
async def list_resources_for_entity(
    entity_type: str,
    entity_id: int,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[ResourceResponse]:
    """List all resources for an entity."""
    service = ResourceService(db)
    from app.domains.resources.repository import ResourceRepository
    repo = ResourceRepository(db)
    return await repo.list_by_entity(entity_type, entity_id, skip, limit)


@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResourceResponse:
    """Get a resource by ID."""
    service = ResourceService(db)
    return await service.get(resource_id)


@router.delete("/{resource_id}")
async def delete_resource(
    resource_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a resource."""
    service = ResourceService(db)
    await service.delete(resource_id)
    await db.commit()
    return {"message": "Resource deleted successfully"}
