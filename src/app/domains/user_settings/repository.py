"""User settings domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import UserSettings


class UserSettingsRepository:
    """Repository for UserSettings model."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_user(self, user_id: int) -> UserSettings | None:
        """Get settings for a user if they exist."""
        stmt = select(UserSettings).where(UserSettings.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_for_user(self, user_id: int) -> UserSettings:
        """Create empty settings for a user."""
        settings = UserSettings(user_id=user_id)
        self.session.add(settings)
        await self.session.flush()
        return settings
