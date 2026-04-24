"""People domain - schemas for request/response validation."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ContactInfoSchema(BaseModel):
    """Contact information schema."""

    contact_type: str  # phone, email, address, social_media
    value: str

    class Config:
        """Pydantic config."""

        from_attributes = True


class PersonCreateRequest(BaseModel):
    """Create person request."""

    first_name: str
    last_name: Optional[str] = None
    birth_date: Optional[date] = None
    date_of_death: Optional[date] = None
    notes: Optional[str] = None


class PersonUpdateRequest(BaseModel):
    """Update person request."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[date] = None
    date_of_death: Optional[date] = None
    notes: Optional[str] = None


class PersonResponse(BaseModel):
    """Person response."""

    id: int
    first_name: str
    last_name: Optional[str]
    birth_date: Optional[date]
    date_of_death: Optional[date]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
