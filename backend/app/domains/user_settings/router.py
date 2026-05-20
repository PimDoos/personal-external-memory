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
    response = await service.get(current_user.id)
    data = response.model_dump()
    data["openid_linked"] = bool(current_user.openid_subject and current_user.openid_issuer)
    return UserSettingsResponse(**data)


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
    response = UserSettingsResponse.model_validate(settings)
    data = response.model_dump()
    data["openid_linked"] = bool(current_user.openid_subject and current_user.openid_issuer)
    return UserSettingsResponse(**data)
