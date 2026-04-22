"""Managed type list service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.types.schemas import ManagedTypeCreateRequest, ManagedTypeUpdateRequest
from app.infrastructure.exceptions import NotFoundError
from app.infrastructure.models import ManagedType

VALID_CATEGORIES = {
    "contact-info",
    "relationship",
    "social-circle",
    "event",
    "interaction",
    "interaction-medium",
    "brand-membership",
}

DEFAULT_TYPES = {
    "contact-info": [
        {"name": "Phone", "uri_handler": "tel:"},
        {"name": "Email", "uri_handler": "mailto:"},
        {"name": "URL", "uri_handler": "https://"},
        {"name": "Custom"},
    ],
    "relationship": [
        {"name": "ParentChild", "left_label": "Parent", "right_label": "Child", "emoji": "👨‍👩‍👧"},
        {"name": "Friend", "left_label": "Friend", "right_label": "Friend", "emoji": "🤝"},
        {"name": "Sibling", "left_label": "Sibling", "right_label": "Sibling", "emoji": "🧑‍🤝‍🧑"},
        {"name": "Colleague", "left_label": "Colleague", "right_label": "Colleague", "emoji": "💼"},
        {"name": "Partner", "left_label": "Partner", "right_label": "Partner", "emoji": "❤️"},
        {"name": "Date", "left_label": "Date", "right_label": "Date", "emoji": "🌹"},
    ],
    "social-circle": [{"name": "General"}],
    "event": [{"name": "General"}],
    "interaction": [{"name": "General"}],
    "interaction-medium": [
        {"name": "In person"},
        {"name": "Phone"},
        {"name": "Email"},
        {"name": "Chat"},
        {"name": "Video"},
    ],
    "brand-membership": [
        {"name": "Employee"},
        {"name": "Owner"},
        {"name": "Customer"},
    ],
}


class ManagedTypeService:
    """Service for user-managed type lists."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def validate_category(self, category: str) -> None:
        if category not in VALID_CATEGORIES:
            raise NotFoundError("Type category not found")

    async def ensure_defaults(self, user_id: int, category: str) -> None:
        self.validate_category(category)
        stmt = select(ManagedType).where(
            (ManagedType.user_id == user_id) & (ManagedType.category == category)
        )
        result = await self.session.execute(stmt)
        if result.scalars().first() is not None:
            return

        for entry in DEFAULT_TYPES.get(category, []):
            self.session.add(
                ManagedType(
                    user_id=user_id,
                    category=category,
                    name=entry["name"],
                    uri_handler=entry.get("uri_handler"),
                    left_label=entry.get("left_label"),
                    right_label=entry.get("right_label"),
                    emoji=entry.get("emoji"),
                )
            )
        await self.session.flush()

    async def list_for_category(self, user_id: int, category: str) -> list[ManagedType]:
        await self.ensure_defaults(user_id, category)
        stmt = (
            select(ManagedType)
            .where((ManagedType.user_id == user_id) & (ManagedType.category == category))
            .order_by(ManagedType.name.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, user_id: int, category: str, data: ManagedTypeCreateRequest) -> ManagedType:
        self.validate_category(category)
        entry = ManagedType(
            user_id=user_id,
            category=category,
            name=data.name,
            uri_handler=data.uri_handler,
            left_label=data.left_label,
            right_label=data.right_label,
            emoji=data.emoji,
        )
        self.session.add(entry)
        await self.session.flush()
        await self.session.refresh(entry)
        return entry

    async def get(self, user_id: int, category: str, type_id: int) -> ManagedType:
        self.validate_category(category)
        stmt = select(ManagedType).where(
            (ManagedType.id == type_id)
            & (ManagedType.user_id == user_id)
            & (ManagedType.category == category)
        )
        result = await self.session.execute(stmt)
        entry = result.scalar_one_or_none()
        if not entry:
            raise NotFoundError("Type entry not found")
        return entry

    async def update(self, user_id: int, category: str, type_id: int, data: ManagedTypeUpdateRequest) -> ManagedType:
        entry = await self.get(user_id, category, type_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(entry, key, value)
        await self.session.flush()
        await self.session.refresh(entry)
        return entry

    async def delete(self, user_id: int, category: str, type_id: int) -> None:
        entry = await self.get(user_id, category, type_id)
        await self.session.delete(entry)
        await self.session.flush()
