"""Locations domain - business logic."""

from datetime import datetime, timedelta
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.locations.geocoding import NominatimGeocoder
from app.domains.locations.schemas import LocationCreateRequest, LocationUpdateRequest
from app.infrastructure.models import (
    Brand,
    Event,
    Location,
    LocationAssociation,
    Person,
    SocialCircle,
)
from app.infrastructure.exceptions import NotFoundError


ENTITY_MODEL_BY_TYPE = {
    "person": Person,
    "brand": Brand,
    "social_circle": SocialCircle,
    "event": Event,
}


class LocationService:
    """Service for managing locations."""

    def __init__(self, session: AsyncSession):
        """Initialize location service."""
        self.session = session

    @staticmethod
    def _is_coordinate_pair(value: str) -> bool:
        """Return true when value looks like exactly two numeric coordinates."""
        parts = [part.strip() for part in str(value or "").split(",")]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            return False

        try:
            float(parts[0])
            float(parts[1])
            return True
        except ValueError:
            return False

    @classmethod
    def _default_label_for_location(cls, location: str | None) -> str | None:
        """Build default label from location text.

        Rule:
        - For a comma-separated address, use the first part.
        - If the value is a coordinate pair, use the full pair.
        """
        if location is None:
            return None

        normalized_location = str(location).strip()
        if not normalized_location:
            return None

        if cls._is_coordinate_pair(normalized_location):
            parts = [part.strip() for part in normalized_location.split(",")]
            return f"{parts[0]}, {parts[1]}"

        first_part = normalized_location.split(",", maxsplit=1)[0].strip()
        return first_part or normalized_location

    @staticmethod
    def _normalize_label(label: str | None) -> str | None:
        """Normalize empty location labels to null."""
        if label is None:
            return None

        normalized = str(label).strip()
        return normalized or None

    @staticmethod
    def _is_valid_geocode(latitude: float | None, longitude: float | None) -> bool:
        if latitude is None or longitude is None:
            return False
        return abs(float(latitude)) <= 90 and abs(float(longitude)) <= 180

    @staticmethod
    def _parse_coordinates(value: str | None) -> tuple[float, float] | None:
        normalized = str(value or "").strip()
        if not normalized:
            return None

        point_match = re.match(r"^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$", normalized, flags=re.IGNORECASE)
        if point_match:
            lon = float(point_match.group(1))
            lat = float(point_match.group(2))
            if abs(lat) <= 90 and abs(lon) <= 180:
                return lat, lon

        number_matches = re.findall(r"-?\d+(?:\.\d+)?", normalized)
        if len(number_matches) < 2:
            return None

        first = float(number_matches[0])
        second = float(number_matches[1])

        first_can_be_lat = abs(first) <= 90
        first_can_be_lon = abs(first) <= 180
        second_can_be_lat = abs(second) <= 90
        second_can_be_lon = abs(second) <= 180

        if first_can_be_lat and second_can_be_lon:
            return first, second
        if first_can_be_lon and second_can_be_lat:
            return second, first

        return None

    @staticmethod
    def _is_geocodable_address(value: str | None) -> bool:
        normalized = str(value or "").strip()
        if not normalized:
            return False
        return bool(re.search(r"[A-Za-z]", normalized))

    async def _resolve_geocode_if_needed(self, location: Location, force_refresh: bool = False) -> bool:
        """Resolve and persist geocode on the location when missing or invalid.

        Returns True when the location object was modified.
        """
        if not force_refresh and self._is_valid_geocode(location.latitude, location.longitude):
            return False

        now = datetime.utcnow()

        # Avoid repeatedly geocoding addresses that recently failed.
        if (
            not force_refresh
            and location.geocode_status == "not_found"
            and location.geocoded_at is not None
            and now - location.geocoded_at < timedelta(hours=24)
        ):
            return False

        parsed = self._parse_coordinates(location.location)
        if parsed is not None:
            location.latitude, location.longitude = parsed
            location.geocode_status = "coordinate_input"
            location.geocoded_at = now
            return True

        if not self._is_geocodable_address(location.location):
            location.latitude = None
            location.longitude = None
            location.geocode_status = "invalid_input"
            location.geocoded_at = now
            return True

        geocoded = await NominatimGeocoder.geocode(location.location)
        if geocoded is None:
            location.latitude = None
            location.longitude = None
            location.geocode_status = "not_found"
            location.geocoded_at = now
            return True

        location.latitude, location.longitude = geocoded
        location.geocode_status = "nominatim"
        location.geocoded_at = now
        return True

    async def ensure_geocoded_for_response(self, location: Location) -> Location:
        """Ensure location has a persisted valid geocode before API response."""
        changed = await self._resolve_geocode_if_needed(location, force_refresh=False)
        if changed:
            await self.session.flush()
            await self.session.refresh(location)
        return location

    async def _ensure_entity_owned(self, entity_type: str, entity_id: int, user_id: int) -> None:
        """Validate that an association target exists and belongs to the user."""
        model = ENTITY_MODEL_BY_TYPE.get(entity_type)
        if model is None:
            raise NotFoundError("Unsupported entity type")

        stmt = select(model.id).where((model.id == entity_id) & (model.user_id == user_id))
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none() is None:
            raise NotFoundError(f"{entity_type.replace('_', ' ').title()} not found")

    async def create(self, user_id: int, data: LocationCreateRequest) -> Location:
        """Create a new location."""
        resolved_label = self._normalize_label(data.label)
        if resolved_label is None:
            resolved_label = self._default_label_for_location(data.location)

        location = Location(
            user_id=user_id,
            location_type=data.location_type,
            label=resolved_label,
            location=data.location,
        )
        self.session.add(location)
        await self._resolve_geocode_if_needed(location, force_refresh=True)
        await self.session.flush()
        await self.session.refresh(location)
        return location

    async def get(self, location_id: int, user_id: int) -> Location:
        """Get a location by ID."""
        stmt = select(Location).where(
            (Location.id == location_id) & (Location.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        location = result.scalar_one_or_none()

        if not location:
            raise NotFoundError("Location not found")

        return location

    async def update(self, location_id: int, user_id: int, data: LocationUpdateRequest) -> Location:
        """Update a location."""
        location = await self.get(location_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        if "label" in update_data:
            update_data["label"] = self._normalize_label(update_data["label"])
            if update_data["label"] is None:
                effective_location = update_data.get("location", location.location)
                update_data["label"] = self._default_label_for_location(effective_location)
        elif "location" in update_data and not self._normalize_label(location.label):
            update_data["label"] = self._default_label_for_location(update_data.get("location"))

        for key, value in update_data.items():
            setattr(location, key, value)

        if "location" in update_data:
            location.latitude = None
            location.longitude = None
            location.geocode_status = None
            location.geocoded_at = None

        if "location" in update_data or not self._is_valid_geocode(location.latitude, location.longitude):
            await self._resolve_geocode_if_needed(location, force_refresh=True)

        await self.session.flush()
        await self.session.refresh(location)
        return location

    async def delete(self, location_id: int, user_id: int) -> None:
        """Delete a location."""
        location = await self.get(location_id, user_id)

        association_stmt = select(LocationAssociation).where(
            LocationAssociation.location_id == location_id
        )
        association_result = await self.session.execute(association_stmt)
        for association in association_result.scalars().all():
            await self.session.delete(association)

        await self.session.delete(location)
        await self.session.flush()

    async def associate_with_entity(
        self, location_id: int, entity_type: str, entity_id: int, user_id: int
    ) -> None:
        """Associate a location with an entity."""
        await self.get(location_id, user_id)
        await self._ensure_entity_owned(entity_type, entity_id, user_id)

        # Check if association already exists
        stmt = select(LocationAssociation).where(
            (LocationAssociation.location_id == location_id)
            & (LocationAssociation.entity_type == entity_type)
            & (LocationAssociation.entity_id == entity_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            return  # Association already exists

        # Create association
        association = LocationAssociation(
            location_id=location_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        self.session.add(association)
        await self.session.flush()

    async def remove_association(
        self, location_id: int, entity_type: str, entity_id: int, user_id: int
    ) -> None:
        """Remove association between location and entity."""
        await self.get(location_id, user_id)
        await self._ensure_entity_owned(entity_type, entity_id, user_id)

        # Delete association
        stmt = select(LocationAssociation).where(
            (LocationAssociation.location_id == location_id)
            & (LocationAssociation.entity_type == entity_type)
            & (LocationAssociation.entity_id == entity_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()

        if association:
            await self.session.delete(association)
            await self.session.flush()

    async def get_associations_for_location(
        self, location_id: int, user_id: int
    ) -> list[LocationAssociation]:
        """Get all associations for a location."""
        # Verify location ownership
        await self.get(location_id, user_id)

        stmt = select(LocationAssociation).where(
            LocationAssociation.location_id == location_id
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_for_entity(
        self, entity_type: str, entity_id: int, user_id: int
    ) -> list[Location]:
        """List all locations associated with an entity."""
        await self._ensure_entity_owned(entity_type, entity_id, user_id)

        stmt = (
            select(Location)
            .join(LocationAssociation, LocationAssociation.location_id == Location.id)
            .where(
                (Location.user_id == user_id)
                & (LocationAssociation.entity_type == entity_type)
                & (LocationAssociation.entity_id == entity_id)
            )
            .order_by(Location.label.asc(), Location.id.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
