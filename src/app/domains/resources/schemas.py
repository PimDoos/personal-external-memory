"""Resources domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ResourceCreateRequest(BaseModel):
    """Create resource request."""

    entity_type: str
    entity_id: int
    resource_type: str  # link or file
    url: Optional[str] = None
    file_path: Optional[str] = None


class ResourceResponse(BaseModel):
    """Resource response."""

    id: int
    entity_type: str
    entity_id: int
    resource_type: str
    url: Optional[str]
    file_path: Optional[str]
    created_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
