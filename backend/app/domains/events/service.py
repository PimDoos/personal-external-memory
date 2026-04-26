"""Events domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.events.schemas import EventCreateRequest, EventUpdateRequest
from app.infrastructure.models import Event
from app.infrastructure.exceptions import NotFoundError


class EventService:
    """Service for managing events."""

    def __init__(self, session: AsyncSession):
        """Initialize event service."""
        self.session = session

    async def create(self, user_id: int, data: EventCreateRequest) -> Event:
        """Create a new event."""
        event = Event(
            user_id=user_id,
            title=data.title,
            event_type=data.event_type,
            date=data.date,
            start_time=data.start_time,
            end_time=data.end_time,
            notes=data.notes,
        )
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def get(self, event_id: int, user_id: int) -> Event:
        """Get an event by ID."""
        stmt = select(Event).where(
            (Event.id == event_id) & (Event.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            raise NotFoundError("Event not found")

        return event

    async def update(self, event_id: int, user_id: int, data: EventUpdateRequest) -> Event:
        """Update an event."""
        event = await self.get(event_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(event, key, value)

        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def delete(self, event_id: int, user_id: int) -> None:
        """Delete an event."""
        event = await self.get(event_id, user_id)
        await self.session.delete(event)
        await self.session.flush()
