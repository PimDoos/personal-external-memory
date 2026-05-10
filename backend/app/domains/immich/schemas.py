"""Immich integration schemas."""

from datetime import datetime

from pydantic import BaseModel


class ImmichConnectionTestResponse(BaseModel):
    """Immich connection test response."""

    ok: bool
    message: str
    user_email: str | None = None


class ImmichSyncFacesResponse(BaseModel):
    """Result of syncing faces from Immich."""

    created: int
    updated: int
    skipped: int
    total_remote: int


class ImmichAssetResponse(BaseModel):
    """Normalized Immich asset payload for frontend rendering."""

    id: str
    type: str | None = None
    created_at: datetime | None = None
    original_path: str | None = None
    thumbnail_url: str | None = None
    preview_url: str | None = None
    immich_url: str | None = None


class ImmichGalleryResponse(BaseModel):
    """Gallery response for person/event/location."""

    context: str
    items: list[ImmichAssetResponse]
