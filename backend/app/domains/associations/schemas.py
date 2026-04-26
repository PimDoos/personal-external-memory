"""Associations domain - schemas for working with associations."""

from pydantic import BaseModel


class CircleMemberRequest(BaseModel):
    """Add/remove member from circle."""

    social_circle_id: int
    person_id: int


class CircleMemberResponse(BaseModel):
    """Circle member association response."""

    social_circle_id: int
    person_id: int

    class Config:
        """Pydantic config."""

        from_attributes = True


class EventParticipantRequest(BaseModel):
    """Add/remove participant from event."""

    event_id: int
    person_id: int
    role: str | None = None  # host, guest, organizer, etc.


class EventParticipantResponse(BaseModel):
    """Event participant association response."""

    event_id: int
    person_id: int
    role: str | None

    class Config:
        """Pydantic config."""

        from_attributes = True


class BrandAssociationRequest(BaseModel):
    """Add/remove member from brand."""

    brand_id: int
    person_id: int
    type: str | None = None  # employee, owner, customer, etc.


class BrandAssociationResponse(BaseModel):
    """Brand association response."""

    brand_id: int
    person_id: int
    type: str | None

    class Config:
        """Pydantic config."""

        from_attributes = True


class CircleEventRequest(BaseModel):
    """Associate event with social circle."""

    social_circle_id: int
    event_id: int


class CircleEventResponse(BaseModel):
    """Circle-event association response."""

    social_circle_id: int
    event_id: int

    class Config:
        """Pydantic config."""

        from_attributes = True
