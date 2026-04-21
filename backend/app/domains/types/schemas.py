"""Managed type list schemas."""

from typing import Optional

from pydantic import BaseModel


class ManagedTypeCreateRequest(BaseModel):
    """Create a managed type entry."""

    name: str
    uri_handler: Optional[str] = None
    left_label: Optional[str] = None
    right_label: Optional[str] = None
    emoji: Optional[str] = None


class ManagedTypeUpdateRequest(BaseModel):
    """Update a managed type entry."""

    name: Optional[str] = None
    uri_handler: Optional[str] = None
    left_label: Optional[str] = None
    right_label: Optional[str] = None
    emoji: Optional[str] = None


class ManagedTypeResponse(BaseModel):
    """Managed type entry response."""

    id: int
    category: str
    name: str
    uri_handler: Optional[str]
    left_label: Optional[str]
    right_label: Optional[str]
    emoji: Optional[str]

    class Config:
        """Pydantic config."""

        from_attributes = True
