"""Associations domain - business logic for managing associations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import (
    CircleMember,
    EventParticipant,
    InteractionParticipant,
    SocialCircle,
    Event,
    Interaction,
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

    async def add_participant_to_event(
        self, event_id: int, person_id: int, user_id: int, role: str | None = None
    ) -> EventParticipant:
        """Add a person as a participant to an event."""
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


class InteractionParticipantService:
    """Service for managing interaction participants."""

    def __init__(self, session: AsyncSession):
        """Initialize interaction participant service."""
        self.session = session

    async def add_participant_to_interaction(
        self, interaction_id: int, person_id: int, user_id: int
    ) -> InteractionParticipant:
        """Add a person as a participant to an interaction."""
        # Verify interaction ownership
        stmt = select(Interaction).where(
            (Interaction.id == interaction_id) & (Interaction.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Interaction not found")

        # Verify person ownership
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Person not found")

        # Check if already a participant
        stmt = select(InteractionParticipant).where(
            (InteractionParticipant.interaction_id == interaction_id)
            & (InteractionParticipant.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Person is already a participant in this interaction")

        # Add participant
        participant = InteractionParticipant(
            interaction_id=interaction_id, person_id=person_id
        )
        self.session.add(participant)
        await self.session.flush()
        return participant

    async def remove_participant_from_interaction(
        self, interaction_id: int, person_id: int, user_id: int
    ) -> None:
        """Remove a person from an interaction."""
        # Verify interaction ownership
        stmt = select(Interaction).where(
            (Interaction.id == interaction_id) & (Interaction.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError("Interaction not found")

        # Find and delete participation
        stmt = select(InteractionParticipant).where(
            (InteractionParticipant.interaction_id == interaction_id)
            & (InteractionParticipant.person_id == person_id)
        )
        result = await self.session.execute(stmt)
        participant = result.scalar_one_or_none()

        if not participant:
            raise NotFoundError("Person is not a participant in this interaction")

        await self.session.delete(participant)
        await self.session.flush()
