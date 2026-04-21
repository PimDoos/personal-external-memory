"""Interactions domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.interactions.schemas import (
    InteractionCreateRequest,
    InteractionUpdateRequest,
)
from app.infrastructure.models import Interaction
from app.infrastructure.exceptions import NotFoundError


class InteractionService:
    """Service for managing interactions."""

    def __init__(self, session: AsyncSession):
        """Initialize interaction service."""
        self.session = session

    async def create(self, user_id: int, data: InteractionCreateRequest) -> Interaction:
        """Create a new interaction."""
        interaction = Interaction(
            user_id=user_id,
            title=data.title,
            interaction_type=data.interaction_type,
            date=data.date,
            start_time=data.start_time,
            end_time=data.end_time,
            medium=data.medium,
            location=data.location,
            notes=data.notes,
        )
        self.session.add(interaction)
        await self.session.flush()
        await self.session.refresh(interaction)
        return interaction

    async def get(self, interaction_id: int, user_id: int) -> Interaction:
        """Get an interaction by ID."""
        stmt = select(Interaction).where(
            (Interaction.id == interaction_id) & (Interaction.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        interaction = result.scalar_one_or_none()

        if not interaction:
            raise NotFoundError("Interaction not found")

        return interaction

    async def update(
        self, interaction_id: int, user_id: int, data: InteractionUpdateRequest
    ) -> Interaction:
        """Update an interaction."""
        interaction = await self.get(interaction_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(interaction, key, value)

        await self.session.flush()
        await self.session.refresh(interaction)
        return interaction

    async def delete(self, interaction_id: int, user_id: int) -> None:
        """Delete an interaction."""
        interaction = await self.get(interaction_id, user_id)
        await self.session.delete(interaction)
        await self.session.flush()
