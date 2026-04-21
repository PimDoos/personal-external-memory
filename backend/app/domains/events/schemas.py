"""Events domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EventCreateRequest(BaseModel):
    """Create event request."""

    title: Optional[str] = None
    event_type: Optional[str] = None
    date: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class EventUpdateRequest(BaseModel):
    """Update event request."""

    title: Optional[str] = None
    event_type: Optional[str] = None
    date: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class EventResponse(BaseModel):
    """Event response."""

    id: int
    title: Optional[str]
    event_type: Optional[str]
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
