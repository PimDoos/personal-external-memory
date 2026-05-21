"""Contact Info domain - schemas for request/response validation."""

from pydantic import BaseModel


class ContactInfoCreateRequest(BaseModel):
    """Create contact info request."""

    person_id: int
    contact_type: str  # phone, email, address, social_media
    value: str


class ContactInfoUpdateRequest(BaseModel):
    """Update contact info request."""

    contact_type: str
    value: str


class ContactInfoResponse(BaseModel):
    """Contact info response."""

    id: int
    person_id: int
    contact_type: str
    value: str

    class Config:
        """Pydantic config."""

        from_attributes = True
