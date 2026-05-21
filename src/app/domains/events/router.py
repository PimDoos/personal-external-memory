"""Events domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.events.schemas import (
    EventCreateRequest,
    EventDetailResponse,
    EventListResponse,
    EventResponse,
    EventUpdateRequest,
)
from app.domains.events.service import EventService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=EventResponse)
async def create_event(
    request: EventCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Create a new event."""
    service = EventService(db)
    event = await service.create(current_user.id, request)
    await db.commit()
    return event


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    """Get an event by ID."""
    service = EventService(db)
    return await service.get_detail(event_id, current_user.id)


@router.get("", response_model=list[EventListResponse])
async def list_events(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[EventListResponse]:
    """List all events for current user."""
    service = EventService(db)
    return await service.list_with_related(current_user.id, skip, limit)


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    request: EventUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Update an event."""
    service = EventService(db)
    event = await service.update(event_id, current_user.id, request)
    await db.commit()
    return event


@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete an event."""
    service = EventService(db)
    await service.delete(event_id, current_user.id)
    await db.commit()
    return {"message": "Event deleted successfully"}
