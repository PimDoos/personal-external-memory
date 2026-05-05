"""Locations domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.locations.schemas import (
    LocationCreateRequest,
    LocationDetailResponse,
    LocationResponse,
    LocationUpdateRequest,
)
from app.domains.locations.service import LocationService
from app.domains.locations.repository import LocationRepository
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=LocationResponse)
async def create_location(
    request: LocationCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LocationResponse:
    """Create a new location."""
    service = LocationService(db)
    location = await service.create(current_user.id, request)
    await db.commit()
    return location


@router.get("/{location_id}", response_model=LocationDetailResponse)
async def get_location(
    location_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LocationDetailResponse:
    """Get a location by ID."""
    service = LocationService(db)
    location = await service.get(location_id, current_user.id)
    location = await service.ensure_geocoded_for_response(location)
    await db.commit()
    associations = await service.get_associations_for_location(location_id, current_user.id)
    return LocationDetailResponse(
        id=location.id,
        location_type=location.location_type,
        label=location.label,
        location=location.location,
        latitude=location.latitude,
        longitude=location.longitude,
        geocode_status=location.geocode_status,
        geocoded_at=location.geocoded_at,
        created_at=location.created_at,
        updated_at=location.updated_at,
        associations=associations,
    )


@router.get("", response_model=list[LocationResponse])
async def list_locations(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[LocationResponse]:
    """List all locations for current user."""
    repo = LocationRepository(db)
    service = LocationService(db)
    locations = await repo.list_by_user(current_user.id, skip, limit)
    for location in locations:
        await service.ensure_geocoded_for_response(location)
    await db.commit()
    return locations


@router.put("/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: int,
    request: LocationUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LocationResponse:
    """Update a location."""
    service = LocationService(db)
    location = await service.update(location_id, current_user.id, request)
    await db.commit()
    return location


@router.delete("/{location_id}")
async def delete_location(
    location_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a location."""
    service = LocationService(db)
    await service.delete(location_id, current_user.id)
    await db.commit()
    return {"message": "Location deleted successfully"}


@router.post("/{location_id}/associate/{entity_type}/{entity_id}")
async def associate_location(
    location_id: int,
    entity_type: str,
    entity_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Associate a location with an entity."""
    service = LocationService(db)
    await service.associate_with_entity(location_id, entity_type, entity_id, current_user.id)
    await db.commit()
    return {"message": "Location associated successfully"}


@router.delete("/{location_id}/associate/{entity_type}/{entity_id}")
async def remove_location_association(
    location_id: int,
    entity_type: str,
    entity_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove association between location and entity."""
    service = LocationService(db)
    await service.remove_association(location_id, entity_type, entity_id, current_user.id)
    await db.commit()
    return {"message": "Location association removed successfully"}
