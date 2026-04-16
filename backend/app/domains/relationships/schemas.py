"""Relationships domain - schemas for request/response validation."""

from typing import Optional
from pydantic import BaseModel


class PersonRelationshipCreateRequest(BaseModel):
    """Create person relationship request."""

    person_id_1: int
    person_id_2: int
    relationship_type: str  # family, friend, colleague, etc.
    notes: Optional[str] = None


class PersonRelationshipUpdateRequest(BaseModel):
    """Update person relationship request."""

    relationship_type: Optional[str] = None
    notes: Optional[str] = None


class PersonRelationshipResponse(BaseModel):
    """Person relationship response."""

    id: int
    person_id_1: int
    person_id_2: int
    relationship_type: str
    notes: Optional[str]

    class Config:
        """Pydantic config."""

        from_attributes = True
