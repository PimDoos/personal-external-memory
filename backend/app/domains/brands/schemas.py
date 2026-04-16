"""Brands domain - schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BrandCreateRequest(BaseModel):
    """Create brand request."""

    name: str
    description: Optional[str] = None
    notes: Optional[str] = None


class BrandUpdateRequest(BaseModel):
    """Update brand request."""

    name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class BrandResponse(BaseModel):
    """Brand response."""

    id: int
    name: str
    description: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
