"""User settings domain - API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.user_settings.schemas import UserSettingsResponse, UserSettingsUpdateRequest
from app.domains.user_settings.service import UserSettingsService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.get("", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Get settings for the current user."""
    service = UserSettingsService(db)
    return await service.get(current_user.id)


@router.put("", response_model=UserSettingsResponse)
async def update_user_settings(
    request: UserSettingsUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Create or update settings for the current user."""
    service = UserSettingsService(db)
    settings = await service.update(current_user.id, request)
    await db.commit()
    return UserSettingsResponse.model_validate(settings)
