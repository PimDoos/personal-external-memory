"""Events domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EventCreateRequest(BaseModel):
    """Create event request."""

    date: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class EventUpdateRequest(BaseModel):
    """Update event request."""

    date: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class EventResponse(BaseModel):
    """Event response."""

    id: int
    date: datetime
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    location: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
