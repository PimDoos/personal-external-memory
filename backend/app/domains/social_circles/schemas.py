"""Social circles domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SocialCircleCreateRequest(BaseModel):
    """Create social circle request."""

    name: str
    description: Optional[str] = None
    notes: Optional[str] = None


class SocialCircleUpdateRequest(BaseModel):
    """Update social circle request."""

    name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class SocialCircleResponse(BaseModel):
    """Social circle response."""

    id: int
    name: str
    description: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
