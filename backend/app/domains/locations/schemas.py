"""Locations domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LocationCreateRequest(BaseModel):
    """Create location request."""

    location_type: Optional[str] = None
    label: Optional[str] = None
    location: str


class LocationUpdateRequest(BaseModel):
    """Update location request."""

    location_type: Optional[str] = None
    label: Optional[str] = None
    location: Optional[str] = None


class LocationResponse(BaseModel):
    """Location response."""

    id: int
    location_type: Optional[str]
    label: Optional[str]
    location: str
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class LocationAssociationResponse(BaseModel):
    """Location association response."""

    id: int
    location_id: int
    entity_type: str
    entity_id: int

    class Config:
        """Pydantic config."""

        from_attributes = True


class LocationDetailResponse(LocationResponse):
    """Location detail payload with associations for detail rendering."""

    associations: list[LocationAssociationResponse] = []
