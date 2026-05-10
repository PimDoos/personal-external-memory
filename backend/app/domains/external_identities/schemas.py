"""External identities domain - schemas for request/response validation."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ExternalIdentityCreateRequest(BaseModel):
    """Create external identity request."""

    display_name: str
    external_id: str
    source: str
    entity_type: str
    click_uri: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    content: Optional[str] = None
    is_read_only: bool = True


class ExternalIdentityUpdateRequest(BaseModel):
    """Update external identity request."""

    display_name: Optional[str] = None
    click_uri: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    content: Optional[str] = None
    is_read_only: Optional[bool] = None


class ExternalIdentityResponse(BaseModel):
    """External identity response."""

    id: int
    display_name: str
    external_id: str
    source: str
    entity_type: str
    click_uri: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    image_url: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    content: Optional[str]
    is_read_only: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class ExternalIdentityAssociationCreateRequest(BaseModel):
    """Associate an external identity with an internal entity."""

    entity_type: str
    entity_id: int


class ExternalIdentityAssociationResponse(BaseModel):
    """External identity association response."""

    id: int
    external_identity_id: int
    entity_type: str
    entity_id: int
    created_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True


class ExternalIdentityDetailResponse(ExternalIdentityResponse):
    """External identity detail with associations."""

    associations: list[ExternalIdentityAssociationResponse] = []


class ImmichPersonFaceLinkCandidateResponse(BaseModel):
    """Minimal Immich face payload used for person-linking UI."""

    id: int
    external_id: str
    display_name: str
    image_url: Optional[str]
    click_uri: Optional[str]
    linked_association_id: Optional[int] = None
    linked_person_id: Optional[int] = None
