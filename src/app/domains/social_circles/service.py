"""Social circles domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.social_circles.schemas import (
    SocialCircleCreateRequest,
    SocialCircleDetailResponse,
    SocialCircleListResponse,
    SocialCircleUpdateRequest,
)
from app.infrastructure.models import CircleMember, LocationAssociation, SocialCircle, SocialCircleAssociation
from app.infrastructure.exceptions import NotFoundError


class SocialCircleService:
    """Service for managing social circles."""

    def __init__(self, session: AsyncSession):
        """Initialize social circle service."""
        self.session = session

    async def create(self, user_id: int, data: SocialCircleCreateRequest) -> SocialCircle:
        """Create a new social circle."""
        circle = SocialCircle(
            user_id=user_id,
            name=data.name,
            circle_type=data.circle_type,
            description=data.description,
            notes=data.notes,
        )
        self.session.add(circle)
        await self.session.flush()
        await self.session.refresh(circle)
        return circle

    async def get(self, circle_id: int, user_id: int) -> SocialCircle:
        """Get a social circle by ID."""
        stmt = select(SocialCircle).where(
            (SocialCircle.id == circle_id) & (SocialCircle.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        circle = result.scalar_one_or_none()

        if not circle:
            raise NotFoundError("Social circle not found")

        return circle

    async def update(
        self, circle_id: int, user_id: int, data: SocialCircleUpdateRequest
    ) -> SocialCircle:
        """Update a social circle."""
        circle = await self.get(circle_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(circle, key, value)

        await self.session.flush()
        await self.session.refresh(circle)
        return circle

    async def delete(self, circle_id: int, user_id: int) -> None:
        """Delete a social circle."""
        circle = await self.get(circle_id, user_id)
        await self.session.delete(circle)
        await self.session.flush()

    async def _related_maps(self, circle_ids: list[int]) -> dict[str, dict[int, list[int]]]:
        if not circle_ids:
            return {
                "member_ids": {},
                "event_ids": {},
                "location_ids": {},
            }

        member_ids = {circle_id: [] for circle_id in circle_ids}
        event_ids = {circle_id: [] for circle_id in circle_ids}
        location_ids = {circle_id: [] for circle_id in circle_ids}

        member_rows = (
            await self.session.execute(
                select(CircleMember.social_circle_id, CircleMember.person_id).where(
                    CircleMember.social_circle_id.in_(circle_ids)
                )
            )
        ).all()
        for circle_id, person_id in member_rows:
            member_ids[circle_id].append(person_id)

        event_rows = (
            await self.session.execute(
                select(SocialCircleAssociation.circle_id, SocialCircleAssociation.event_id).where(
                    SocialCircleAssociation.circle_id.in_(circle_ids)
                )
            )
        ).all()
        for circle_id, event_id in event_rows:
            event_ids[circle_id].append(event_id)

        location_rows = (
            await self.session.execute(
                select(LocationAssociation.entity_id, LocationAssociation.location_id).where(
                    LocationAssociation.entity_type == "social_circle",
                    LocationAssociation.entity_id.in_(circle_ids),
                )
            )
        ).all()
        for circle_id, location_id in location_rows:
            location_ids[circle_id].append(location_id)

        return {
            "member_ids": member_ids,
            "event_ids": event_ids,
            "location_ids": location_ids,
        }

    async def list_with_related(
        self, user_id: int, skip: int = 0, limit: int | None = None
    ) -> list[SocialCircleListResponse]:
        """List social circles with summary associations."""
        stmt = select(SocialCircle).where(SocialCircle.user_id == user_id).offset(skip)
        if limit is not None:
            stmt = stmt.limit(limit)
        circles = (await self.session.execute(stmt)).scalars().all()
        circle_ids = [circle.id for circle in circles]
        maps = await self._related_maps(circle_ids)

        return [
            SocialCircleListResponse(
                id=circle.id,
                name=circle.name,
                circle_type=circle.circle_type,
                description=circle.description,
                notes=circle.notes,
                created_at=circle.created_at,
                updated_at=circle.updated_at,
                member_ids=maps["member_ids"].get(circle.id, []),
                event_ids=maps["event_ids"].get(circle.id, []),
                location_ids=maps["location_ids"].get(circle.id, []),
            )
            for circle in circles
        ]

    async def get_detail(self, circle_id: int, user_id: int) -> SocialCircleDetailResponse:
        """Get social circle detail with all related ids needed by the detail UI."""
        circle = await self.get(circle_id, user_id)
        maps = await self._related_maps([circle.id])
        return SocialCircleDetailResponse(
            id=circle.id,
            name=circle.name,
            circle_type=circle.circle_type,
            description=circle.description,
            notes=circle.notes,
            created_at=circle.created_at,
            updated_at=circle.updated_at,
            member_ids=maps["member_ids"].get(circle.id, []),
            event_ids=maps["event_ids"].get(circle.id, []),
            location_ids=maps["location_ids"].get(circle.id, []),
        )
