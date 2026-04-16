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


class InteractionParticipantRequest(BaseModel):
    """Add/remove participant from interaction."""

    interaction_id: int
    person_id: int


class InteractionParticipantResponse(BaseModel):
    """Interaction participant association response."""

    interaction_id: int
    person_id: int

    class Config:
        """Pydantic config."""

        from_attributes = True
