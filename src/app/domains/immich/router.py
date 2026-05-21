"""Immich integration API routes."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.immich.schemas import (
    ImmichConnectionTestResponse,
    ImmichGalleryResponse,
    ImmichSyncFacesResponse,
)
from app.domains.immich.service import ImmichService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("/test-connection", response_model=ImmichConnectionTestResponse)
async def test_immich_connection(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ImmichConnectionTestResponse:
    """Validate current user's Immich credentials."""
    service = ImmichService(db)
    return await service.test_connection(current_user.id)


@router.post("/sync-faces", response_model=ImmichSyncFacesResponse)
async def sync_immich_faces(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ImmichSyncFacesResponse:
    """Sync Immich people/faces into external identities."""
    service = ImmichService(db)
    result = await service.sync_faces(current_user.id)
    await db.commit()
    return result


@router.get("/gallery/person/{person_id}", response_model=ImmichGalleryResponse)
async def get_immich_gallery_for_person(
    person_id: int,
    current_user: CurrentUser,
    limit: int = Query(24, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ImmichGalleryResponse:
    """Get Immich photos for a person via linked face identities."""
    service = ImmichService(db)
    return await service.gallery_for_person(current_user.id, person_id, limit)


@router.get("/gallery/event/{event_id}", response_model=ImmichGalleryResponse)
async def get_immich_gallery_for_event(
    event_id: int,
    current_user: CurrentUser,
    limit: int = Query(24, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ImmichGalleryResponse:
    """Get Immich photos for an event by event date window."""
    service = ImmichService(db)
    return await service.gallery_for_event(current_user.id, event_id, limit)


@router.get("/gallery/location/{location_id}", response_model=ImmichGalleryResponse)
async def get_immich_gallery_for_location(
    location_id: int,
    current_user: CurrentUser,
    limit: int = Query(24, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ImmichGalleryResponse:
    """Get Immich photos for a location via related events date windows."""
    service = ImmichService(db)
    return await service.gallery_for_location(current_user.id, location_id, limit)


@router.get("/assets/{asset_id}/thumbnail")
async def get_immich_asset_thumbnail(
    asset_id: str,
    current_user: CurrentUser,
    size: str = Query("preview"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Proxy Immich asset thumbnail bytes for authenticated frontend rendering."""
    service = ImmichService(db)
    content, media_type = await service.get_asset_thumbnail(current_user.id, asset_id, size)
    return Response(content=content, media_type=media_type)


@router.get("/people/{person_id}/thumbnail")
async def get_immich_person_thumbnail(
    person_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Proxy Immich person thumbnail bytes for authenticated face-avatar rendering."""
    service = ImmichService(db)
    content, media_type = await service.get_person_thumbnail(current_user.id, person_id)
    return Response(content=content, media_type=media_type)


@router.get("/proxy-image")
async def get_immich_proxy_image(
    current_user: CurrentUser,
    path: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Proxy an Immich image URL through PEM using the stored API key."""
    service = ImmichService(db)
    content, media_type = await service.get_proxied_image(current_user.id, path)
    return Response(content=content, media_type=media_type)
