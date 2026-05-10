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


class PersonTagSummary(BaseModel):
    """Tag summary embedded in person payloads."""

    id: int
    name: str
    description: Optional[str]
    color: Optional[str]


class PersonContactInfoEmbedded(BaseModel):
    """Embedded contact info for person detail responses."""

    id: int
    person_id: int
    contact_type: str
    value: str


class PersonLocationEmbedded(BaseModel):
    """Embedded location entry for person detail responses."""

    id: int
    location_type: Optional[str]
    label: Optional[str]
    location: str
    created_at: datetime
    updated_at: datetime


class PersonRelationshipEmbedded(BaseModel):
    """Embedded relationship entry for person detail responses."""

    id: int
    person_id_1: int
    person_id_2: int
    relationship_type: Optional[str]
    relationship_type_id: Optional[int] = None
    notes: Optional[str]
    type_entry: Optional[dict] = None


class PersonBrandMembershipEmbedded(BaseModel):
    """Embedded brand membership for person detail responses."""

    brand_id: int
    person_id: int
    type: Optional[str]


class PersonEventParticipationEmbedded(BaseModel):
    """Embedded event participation for person detail responses."""

    event_id: int
    person_id: int
    role: Optional[str]


class PersonListResponse(PersonResponse):
    """Person list payload with enough data for list screens."""

    tags: list[PersonTagSummary] = []
    circle_ids: list[int] = []
    event_ids: list[int] = []
    explicit_brand_ids: list[int] = []


class PersonDetailResponse(PersonListResponse):
    """Person detail payload with all related entity data for the detail view."""

    contact_infos: list[PersonContactInfoEmbedded] = []
    locations: list[PersonLocationEmbedded] = []
    relationships: list[PersonRelationshipEmbedded] = []
    brand_memberships: list[PersonBrandMembershipEmbedded] = []
    event_participations: list[PersonEventParticipationEmbedded] = []
