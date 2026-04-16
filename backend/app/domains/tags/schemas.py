"""Tags domain - schemas for request/response validation."""

from pydantic import BaseModel


class TagCreateRequest(BaseModel):
    """Create tag request."""

    name: str
    description: str | None = None
    color: str | None = None  # Hex color code


class TagUpdateRequest(BaseModel):
    """Update tag request."""

    name: str | None = None
    description: str | None = None
    color: str | None = None


class TagResponse(BaseModel):
    """Tag response."""

    id: int
    name: str
    description: str | None
    color: str | None

    class Config:
        """Pydantic config."""

        from_attributes = True


class PersonTagAssociationRequest(BaseModel):
    """Associate/dissociate person with tag."""

    person_id: int
    tag_id: int


class PersonTagResponse(BaseModel):
    """Person-tag association response."""

    person_id: int
    tag_id: int

    class Config:
        """Pydantic config."""

        from_attributes = True
