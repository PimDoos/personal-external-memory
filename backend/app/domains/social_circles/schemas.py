"""Social circles domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SocialCircleCreateRequest(BaseModel):
    """Create social circle request."""

    name: str
    circle_type: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class SocialCircleUpdateRequest(BaseModel):
    """Update social circle request."""

    name: Optional[str] = None
    circle_type: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class SocialCircleResponse(BaseModel):
    """Social circle response."""

    id: int
    name: str
    circle_type: Optional[str]
    description: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class SocialCircleListResponse(SocialCircleResponse):
    """Social circle list payload with related summaries."""

    member_ids: list[int] = []
    event_ids: list[int] = []
    location_ids: list[int] = []


class SocialCircleDetailResponse(SocialCircleListResponse):
    """Social circle detail payload."""

    pass
