"""User settings domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.user_settings.repository import UserSettingsRepository
from app.domains.user_settings.schemas import UserSettingsResponse, UserSettingsUpdateRequest
from app.infrastructure.exceptions import ValidationError
from app.infrastructure.models import Person, UserSettings


class UserSettingsService:
    """Service for user settings."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = UserSettingsRepository(session)

    async def get(self, user_id: int) -> UserSettingsResponse:
        """Get settings for a user, returning defaults when missing."""
        settings = await self.repository.get_by_user(user_id)
        if not settings:
            return UserSettingsResponse(
                me_person_id=None,
                immich_api_key=None,
                immich_base_url=None,
                home_assistant_api_key=None,
                home_assistant_base_url=None,
            )

        if settings.me_person_id is not None:
            me_person = await self._get_person_for_user(settings.me_person_id, user_id)
            if me_person is None:
                return UserSettingsResponse(
                    me_person_id=None,
                    immich_api_key=settings.immich_api_key,
                    immich_base_url=settings.immich_base_url,
                    home_assistant_api_key=settings.home_assistant_api_key,
                    home_assistant_base_url=settings.home_assistant_base_url,
                )

        return UserSettingsResponse.model_validate(settings)

    async def update(self, user_id: int, data: UserSettingsUpdateRequest) -> UserSettings:
        """Create or update settings for a user."""
        settings = await self.repository.get_by_user(user_id)
        if not settings:
            settings = await self.repository.create_for_user(user_id)

        payload = data.model_dump(exclude_unset=True)

        if "me_person_id" in payload and payload["me_person_id"] is not None:
            me_person = await self._get_person_for_user(payload["me_person_id"], user_id)
            if me_person is None:
                raise ValidationError("Selected person does not belong to current user")

        for key in (
            "me_person_id",
            "immich_api_key",
            "immich_base_url",
            "home_assistant_api_key",
            "home_assistant_base_url",
        ):
            if key not in payload:
                continue
            value = payload[key]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(settings, key, value)

        await self.session.flush()
        await self.session.refresh(settings)
        return settings

    async def _get_person_for_user(self, person_id: int, user_id: int) -> Person | None:
        stmt = select(Person).where((Person.id == person_id) & (Person.user_id == user_id))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
