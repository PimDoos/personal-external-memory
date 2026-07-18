"""Events domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.events.schemas import EventCreateRequest, EventDetailResponse, EventListResponse, EventUpdateRequest
from app.infrastructure.models import Event, EventParticipant, LocationAssociation, SocialCircleAssociation
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

    async def _related_maps(self, event_ids: list[int]) -> dict[str, dict[int, list]]:
        if not event_ids:
            return {"participants": {}, "circle_ids": {}, "location_ids": {}}

        participants = {event_id: [] for event_id in event_ids}
        circle_ids = {event_id: [] for event_id in event_ids}
        location_ids = {event_id: [] for event_id in event_ids}

        participant_rows = (
            await self.session.execute(
                select(EventParticipant).where(EventParticipant.event_id.in_(event_ids))
            )
        ).scalars().all()
        for participant in participant_rows:
            participants[participant.event_id].append(
                {
                    "event_id": participant.event_id,
                    "person_id": participant.person_id,
                    "role": participant.role,
                }
            )

        circle_rows = (
            await self.session.execute(
                select(SocialCircleAssociation.event_id, SocialCircleAssociation.circle_id).where(
                    SocialCircleAssociation.event_id.in_(event_ids)
                )
            )
        ).all()
        for event_id, circle_id in circle_rows:
            circle_ids[event_id].append(circle_id)

        location_rows = (
            await self.session.execute(
                select(LocationAssociation.entity_id, LocationAssociation.location_id).where(
                    LocationAssociation.entity_type == "event",
                    LocationAssociation.entity_id.in_(event_ids),
                )
            )
        ).all()
        for event_id, location_id in location_rows:
            location_ids[event_id].append(location_id)

        return {"participants": participants, "circle_ids": circle_ids, "location_ids": location_ids}

    async def list_with_related(self, user_id: int, skip: int = 0, limit: int | None = None) -> list[EventListResponse]:
        """List events with related summaries."""
        stmt = select(Event).where(Event.user_id == user_id).offset(skip)
        if limit is not None:
            stmt = stmt.limit(limit)
        events = (await self.session.execute(stmt)).scalars().all()
        event_ids = [event.id for event in events]
        maps = await self._related_maps(event_ids)

        return [
            EventListResponse(
                id=event.id,
                title=event.title,
                event_type=event.event_type,
                date=event.date,
                start_time=event.start_time,
                end_time=event.end_time,
                notes=event.notes,
                created_at=event.created_at,
                updated_at=event.updated_at,
                participants=maps["participants"].get(event.id, []),
                circle_ids=maps["circle_ids"].get(event.id, []),
                location_ids=maps["location_ids"].get(event.id, []),
            )
            for event in events
        ]

    async def get_detail(self, event_id: int, user_id: int) -> EventDetailResponse:
        """Get event detail with related summaries."""
        event = await self.get(event_id, user_id)
        maps = await self._related_maps([event.id])
        return EventDetailResponse(
            id=event.id,
            title=event.title,
            event_type=event.event_type,
            date=event.date,
            start_time=event.start_time,
            end_time=event.end_time,
            notes=event.notes,
            created_at=event.created_at,
            updated_at=event.updated_at,
            participants=maps["participants"].get(event.id, []),
            circle_ids=maps["circle_ids"].get(event.id, []),
            location_ids=maps["location_ids"].get(event.id, []),
        )
