"""Relationships domain - schemas for request/response validation."""

from typing import Optional
from pydantic import BaseModel


class PersonRelationshipCreateRequest(BaseModel):
    """Create person relationship request."""

    person_id_1: int
    person_id_2: int
    relationship_type_id: Optional[int] = None  # FK to ManagedType
    relationship_type: Optional[str] = None  # DEPRECATED: for migration only
    notes: Optional[str] = None


class PersonRelationshipUpdateRequest(BaseModel):
    """Update person relationship request."""

    relationship_type_id: Optional[int] = None
    relationship_type: Optional[str] = None  # DEPRECATED: for migration only
    notes: Optional[str] = None


class PersonRelationshipResponse(BaseModel):
    """Person relationship response."""

    id: int
    person_id_1: int
    person_id_2: int
    relationship_type_id: Optional[int]
    relationship_type: Optional[str]
    notes: Optional[str]
    type_entry: Optional[dict] = None  # Populated with ManagedType details

    class Config:
        """Pydantic config."""

        from_attributes = True
