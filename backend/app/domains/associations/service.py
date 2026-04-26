"""Associations domain - business logic for managing associations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import (
    CircleMember,
    EventParticipant,
    BrandAssociation,
    ManagedType,
    SocialCircle,
    Event,
    Brand,
    Person,
)
from app.infrastructure.exceptions import NotFoundError, ConflictError


class CircleMemberService:
    """Service for managing circle memberships."""

    def __init__(self, session: AsyncSession):
        """Initialize circle member service."""
        self.session = session

    async def add_member_to_circle(
        self, social_circle_id: int, person_id: int, user_id: int
    ) -> CircleMember:
        """Add a person to a social circle."""
        # Verify circle ownership
        stmt = select(SocialCircle).where(
            (SocialCircle.id == social_circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Social circle not found")

        # Verify person ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Check if already a member
        stmt = select(CircleMember).where(
            (CircleMember.social_circle_id == social_circle_id)
            & (CircleMember.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Person is already a member of this circle")

        # Add member
        member = CircleMember(social_circle_id=social_circle_id, person_id=person_id)
        self.session.add(member)
        await self.session.flush()
        return member

    async def remove_member_from_circle(
        self, social_circle_id: int, person_id: int, user_id: int
    ) -> None:
        """Remove a person from a social circle."""
        # Verify circle ownership
        stmt = select(SocialCircle).where(
            (SocialCircle.id == social_circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Social circle not found")

        # Find and delete membership
        stmt = select(CircleMember).where(
            (CircleMember.social_circle_id == social_circle_id)
            & (CircleMember.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        member = result.scalar_one_or_none()

        if not member:
            raise NotFoundError("Person is not a member of this circle")

        await self.session.delete(member)
        await self.session.flush()


class EventParticipantService:
    """Service for managing event participants."""

    def __init__(self, session: AsyncSession):
        """Initialize event participant service."""
        self.session = session

    async def _validate_event_participant_role(
        self, role: str | None, user_id: int
    ) -> str | None:
        """Validate role against managed type entries for event participants."""
        if role is None:
            return None

        normalized = role.strip()
        if normalized == "":
            return None

        stmt = select(ManagedType).where(
            (ManagedType.user_id == user_id)
            & (ManagedType.category == "event-participant-role")
            & (ManagedType.name == normalized)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Event participant role type not found")

        return normalized

    async def add_participant_to_event(
        self, event_id: int, person_id: int, user_id: int, role: str | None = None
    ) -> EventParticipant:
        """Add a person as a participant to an event."""
        role = await self._validate_event_participant_role(role, user_id)
        # Verify event ownership
        stmt = select(Event).where((Event.id == event_id) & (Event.user_id == user_id))
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Event not found")

        # Verify person ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Check if already a participant
        stmt = select(EventParticipant).where(
            (EventParticipant.event_id == event_id)
            & (EventParticipant.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Person is already a participant in this event")

        # Add participant
        participant = EventParticipant(
            event_id=event_id, person_id=person_id, role=role
        )
        self.session.add(participant)
        await self.session.flush()
        return participant

    async def remove_participant_from_event(
        self, event_id: int, person_id: int, user_id: int
    ) -> None:
        """Remove a person from an event."""
        # Verify event ownership
        stmt = select(Event).where((Event.id == event_id) & (Event.user_id == user_id))
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Event not found")

        # Find and delete participation
        stmt = select(EventParticipant).where(
            (EventParticipant.event_id == event_id)
            & (EventParticipant.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        participant = result.scalar_one_or_none()

        if not participant:
            raise NotFoundError("Person is not a participant in this event")

        await self.session.delete(participant)
        await self.session.flush()

    async def update_participant_role(
        self, event_id: int, person_id: int, user_id: int, role: str
    ) -> EventParticipant:
        """Update a participant's role in an event."""
        role = await self._validate_event_participant_role(role, user_id)
        # Verify event ownership
        stmt = select(Event).where((Event.id == event_id) & (Event.user_id == user_id))
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Event not found")

        # Find participation
        stmt = select(EventParticipant).where(
            (EventParticipant.event_id == event_id)
            & (EventParticipant.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        participant = result.scalar_one_or_none()

        if not participant:
            raise NotFoundError("Person is not a participant in this event")

        participant.role = role
        await self.session.flush()
        return participant
class BrandAssociationService:
    """Service for managing brand associations with people."""

    def __init__(self, session: AsyncSession):
        """Initialize brand association service."""
        self.session = session

    async def add_member_to_brand(
        self, brand_id: int, person_id: int, user_id: int, type: str | None = None
    ) -> BrandAssociation:
        """Add a person to a brand."""
        # Verify brand ownership
        stmt = select(Brand).where(
            (Brand.id == brand_id) & (Brand.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Brand not found")

        # Verify person ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Check if already associated
        stmt = select(BrandAssociation).where(
            (BrandAssociation.brand_id == brand_id)
            & (BrandAssociation.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Person is already associated with this brand")

        # Add association
        association = BrandAssociation(brand_id=brand_id, person_id=person_id, type=type)
        self.session.add(association)
        await self.session.flush()
        return association

    async def remove_member_from_brand(
        self, brand_id: int, person_id: int, user_id: int
    ) -> None:
        """Remove a person from a brand."""
        # Verify brand ownership
        stmt = select(Brand).where(
            (Brand.id == brand_id) & (Brand.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Brand not found")

        # Find and delete association
        stmt = select(BrandAssociation).where(
            (BrandAssociation.brand_id == brand_id)
            & (BrandAssociation.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()

        if not association:
            raise NotFoundError("Person is not associated with this brand")

        await self.session.delete(association)
        await self.session.flush()

    async def update_member_type(
        self, brand_id: int, person_id: int, user_id: int, type: str
    ) -> BrandAssociation:
        """Update a member's type in a brand."""
        # Verify brand ownership
        stmt = select(Brand).where(
            (Brand.id == brand_id) & (Brand.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Brand not found")

        # Find association
        stmt = select(BrandAssociation).where(
            (BrandAssociation.brand_id == brand_id)
            & (BrandAssociation.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()

        if not association:
            raise NotFoundError("Person is not associated with this brand")

        association.type = type
        await self.session.flush()
        return association


class CircleEventService:
    """Service for managing circle-event associations."""

    def __init__(self, session: AsyncSession):
        """Initialize circle event service."""
        self.session = session

    async def associate_event_to_circle(
        self, social_circle_id: int, event_id: int, user_id: int
    ) -> "SocialCircleAssociation":
        """Associate an event with a social circle."""
        from app.infrastructure.models import SocialCircleAssociation

        # Verify circle ownership
        stmt = select(SocialCircle).where(
            (SocialCircle.id == social_circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Social circle not found")

        # Verify event ownership
        stmt = select(Event).where(
            (Event.id == event_id) & (Event.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Event not found")

        # Check if already associated
        stmt = select(SocialCircleAssociation).where(
            (SocialCircleAssociation.circle_id == social_circle_id)
            & (SocialCircleAssociation.event_id == event_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Event is already associated with this circle")

        # Create association
        association = SocialCircleAssociation(
            circle_id=social_circle_id, event_id=event_id
        )
        self.session.add(association)
        await self.session.flush()
        return association

    async def remove_event_from_circle(
        self, social_circle_id: int, event_id: int, user_id: int
    ) -> None:
        """Remove an event from a social circle."""
        from app.infrastructure.models import SocialCircleAssociation

        # Verify circle ownership
        stmt = select(SocialCircle).where(
            (SocialCircle.id == social_circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Social circle not found")

        # Find and delete association
        stmt = select(SocialCircleAssociation).where(
            (SocialCircleAssociation.circle_id == social_circle_id)
            & (SocialCircleAssociation.event_id == event_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()

        if not association:
            raise NotFoundError("Event is not associated with this circle")

        await self.session.delete(association)
        await self.session.flush()

