"""Interactions domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class InteractionCreateRequest(BaseModel):
    """Create interaction request."""

    date: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    medium: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class InteractionUpdateRequest(BaseModel):
    """Update interaction request."""

    date: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    medium: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class InteractionResponse(BaseModel):
    """Interaction response."""

    id: int
    date: datetime
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    medium: Optional[str]
    location: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
