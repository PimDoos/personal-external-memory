"""User settings domain - schemas for request/response validation."""

from pydantic import BaseModel


class UserSettingsUpdateRequest(BaseModel):
    """Update user settings request."""

    me_person_id: int | None = None
    immich_api_key: str | None = None
    home_assistant_api_key: str | None = None


class UserSettingsResponse(BaseModel):
    """User settings response."""

    me_person_id: int | None = None
    immich_api_key: str | None = None
    home_assistant_api_key: str | None = None

    class Config:
        """Pydantic config."""

        from_attributes = True
