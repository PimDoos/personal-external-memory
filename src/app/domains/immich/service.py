"""Immich integration business logic."""

from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote_plus, urlencode, urlparse
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.immich.schemas import (
    ImmichAssetResponse,
    ImmichConnectionTestResponse,
    ImmichGalleryResponse,
    ImmichSyncFacesResponse,
)
from app.infrastructure.exceptions import NotFoundError, ValidationError
from app.infrastructure.models import (
    Event,
    ExternalIdentity,
    ExternalIdentityAssociation,
    Location,
    LocationAssociation,
    UserSettings,
)


class ImmichService:
    """Service for Immich integration operations."""

    LOCATION_GALLERY_RADIUS_METERS = 50.0

    def __init__(self, session: AsyncSession):
        self.session = session

    async def test_connection(self, user_id: int) -> ImmichConnectionTestResponse:
        """Test connection with user-scoped Immich credentials."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)

        profile_payload = await self._request_json(base_url, api_key, "GET", "/api/users/me", allow_404=True)
        if isinstance(profile_payload, dict) and profile_payload:
            email = profile_payload.get("email")
            return ImmichConnectionTestResponse(
                ok=True,
                message="Immich connection successful",
                user_email=str(email) if email else None,
            )

        # Fallback for older/newer API variants
        ping_payload = await self._request_json(base_url, api_key, "GET", "/api/server/ping")
        if isinstance(ping_payload, dict) and str(ping_payload.get("res", "")).lower() in {"pong", "ok"}:
            return ImmichConnectionTestResponse(ok=True, message="Immich connection successful")

        return ImmichConnectionTestResponse(ok=True, message="Immich connection appears reachable")

    async def sync_faces(self, user_id: int) -> ImmichSyncFacesResponse:
        """Sync people/faces from Immich into external identities."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)
        people_payload = await self._request_json(base_url, api_key, "GET", "/api/people")
        people_list = self._extract_people(people_payload)

        if not people_list:
            shape = self._describe_payload_shape(people_payload)
            raise ValidationError(
                "Unexpected Immich people response format "
                f"(people={shape})"
            )

        created = 0
        updated = 0
        skipped = 0

        for person in people_list:
            person_id = self._coerce_person_id(person)
            if not person_id:
                skipped += 1
                continue

            name = person.get("name")
            display_name = str(name).strip() if isinstance(name, str) and name.strip() else f"Immich Person {person_id}"
            image_url = f"/api/immich/people/{person_id}/thumbnail"
            click_uri = f"{base_url}/people/{person_id}"

            stmt = select(ExternalIdentity).where(
                (ExternalIdentity.user_id == user_id)
                & (ExternalIdentity.source == "immich")
                & (ExternalIdentity.external_id == person_id)
            )
            existing = (await self.session.execute(stmt)).scalar_one_or_none()

            if existing is None:
                self.session.add(
                    ExternalIdentity(
                        user_id=user_id,
                        display_name=display_name,
                        external_id=person_id,
                        source="immich",
                        entity_type="person",
                        click_uri=click_uri,
                        image_url=image_url,
                        content=None,
                        is_read_only=True,
                    )
                )
                created += 1
            else:
                existing.display_name = display_name
                existing.entity_type = "person"
                existing.click_uri = click_uri
                existing.image_url = image_url
                existing.is_read_only = True
                updated += 1

        await self.session.flush()

        return ImmichSyncFacesResponse(
            created=created,
            updated=updated,
            skipped=skipped,
            total_remote=len(people_list),
        )

    def _extract_people(self, payload: Any) -> list[dict[str, Any]]:
        """Extract people from GET /people response schema."""
        if not isinstance(payload, dict):
            return []
        people = payload.get("people")
        if not isinstance(people, list):
            return []
        return [item for item in people if isinstance(item, dict)]

    def _describe_payload_shape(self, payload: Any) -> str:
        if isinstance(payload, list):
            return f"list(len={len(payload)})"
        if isinstance(payload, dict):
            keys = sorted(str(key) for key in payload.keys())
            return f"dict(keys={keys[:10]})"
        return type(payload).__name__

    async def gallery_for_person(self, user_id: int, person_id: int, limit: int = 24) -> ImmichGalleryResponse:
        """Fetch Immich gallery items for a PEM person via linked face identities."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)

        linked_stmt = (
            select(ExternalIdentity.external_id)
            .join(
                ExternalIdentityAssociation,
                ExternalIdentityAssociation.external_identity_id == ExternalIdentity.id,
            )
            .where(
                (ExternalIdentity.user_id == user_id)
                & (ExternalIdentity.source == "immich")
                & (ExternalIdentity.entity_type == "person")
                & (ExternalIdentityAssociation.entity_type == "person")
                & (ExternalIdentityAssociation.entity_id == person_id)
            )
        )
        linked_face_ids = [str(row[0]) for row in (await self.session.execute(linked_stmt)).all() if row[0]]

        if not linked_face_ids:
            return ImmichGalleryResponse(context="person", items=[])

        payload = {
            "page": 1,
            "size": max(1, min(limit, 200)),
            "personIds": linked_face_ids,
            "withArchived": False,
        }
        search_response = await self._request_json(base_url, api_key, "POST", "/api/search/metadata", payload)
        items = self._extract_assets(search_response)

        return ImmichGalleryResponse(
            context="person",
            items=[self._to_asset_response(base_url, asset) for asset in items],
        )

    async def get_asset_thumbnail(self, user_id: int, asset_id: str, size: str = "preview") -> tuple[bytes, str]:
        """Fetch an Immich asset thumbnail bytes payload via server-side proxy."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)
        normalized_asset_id = str(asset_id or "").strip()
        if not normalized_asset_id:
            raise ValidationError("Asset ID is required")

        allowed_sizes = {"preview", "thumbnail"}
        normalized_size = str(size or "preview").strip().lower()
        if normalized_size not in allowed_sizes:
            normalized_size = "preview"

        query = urlencode({"size": normalized_size})
        path = f"/api/assets/{normalized_asset_id}/thumbnail?{query}"
        return await self._request_binary(base_url, api_key, "GET", path)

    async def get_person_thumbnail(self, user_id: int, person_id: str) -> tuple[bytes, str]:
        """Fetch an Immich person thumbnail by person id."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)
        normalized_person_id = str(person_id or "").strip()
        if not normalized_person_id:
            raise ValidationError("Person ID is required")

        try:
            return await self._request_binary(base_url, api_key, "GET", f"/api/people/{normalized_person_id}/thumbnail")
        except ValidationError:
            pass

        # Fallback: resolve thumbnail path from person payload and proxy that path.
        person_payload = await self._request_json(
            base_url,
            api_key,
            "GET",
            f"/api/people/{normalized_person_id}",
            allow_404=True,
        )
        fallback_path = None
        if isinstance(person_payload, dict):
            fallback_path = self._extract_person_image_url(base_url, person_payload)

        if fallback_path:
            return await self.get_proxied_image(user_id, fallback_path)

        raise NotFoundError("External identity image not available")

    async def get_proxied_image(self, user_id: int, path: str) -> tuple[bytes, str]:
        """Fetch an arbitrary Immich image path through the authenticated PEM backend."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)
        normalized_path = self._normalize_proxied_image_path(path)
        if not normalized_path:
            raise ValidationError("Image path is required")

        if normalized_path.startswith("http://") or normalized_path.startswith("https://"):
            target_path = normalized_path
        else:
            target_path = normalized_path if normalized_path.startswith("/") else f"/{normalized_path}"

        return await self._request_binary(base_url, api_key, "GET", target_path)

    async def get_external_identity_image(self, user_id: int, external_identity_id: int) -> tuple[bytes, str]:
        """Fetch an external identity avatar, falling back to the current Immich person record."""
        stmt = select(ExternalIdentity).where(
            (ExternalIdentity.id == external_identity_id)
            & (ExternalIdentity.user_id == user_id)
        )
        identity = (await self.session.execute(stmt)).scalar_one_or_none()
        if identity is None:
            raise NotFoundError("External identity not found")

        if identity.source == "immich" and identity.entity_type == "person" and identity.external_id:
            try:
                return await self.get_person_thumbnail(user_id, str(identity.external_id))
            except ValidationError:
                pass

        image_url = str(identity.image_url or "").strip()
        if image_url:
            try:
                return await self.get_proxied_image(user_id, image_url)
            except ValidationError:
                pass

        if identity.source != "immich" or identity.entity_type != "person" or not identity.external_id:
            raise NotFoundError("External identity image not available")

        base_url, api_key = await self._get_user_immich_credentials(user_id)
        person_payload = await self._request_json(
            base_url,
            api_key,
            "GET",
            f"/api/people/{identity.external_id}",
            allow_404=True,
        )

        candidates: list[str] = []
        if isinstance(person_payload, dict):
            proxied = self._extract_person_image_url(base_url, person_payload)
            if proxied:
                candidates.append(proxied)
            if isinstance(person_payload.get("person"), dict):
                nested_proxy = self._extract_person_image_url(base_url, person_payload["person"])
                if nested_proxy:
                    candidates.append(nested_proxy)

        for candidate in candidates:
            try:
                return await self.get_proxied_image(user_id, candidate)
            except ValidationError:
                continue

        raise NotFoundError("External identity image not available")

    def _normalize_proxied_image_path(self, path: str | None) -> str:
        raw = str(path or "").strip()
        if not raw:
            return ""

        parsed = urlparse(raw)
        is_local_proxy_route = parsed.path == "/api/immich/proxy-image"
        if is_local_proxy_route:
            proxied_path = parse_qs(parsed.query).get("path", [""])[0]
            return unquote_plus(proxied_path).strip()

        return raw

    async def gallery_for_event(self, user_id: int, event_id: int, limit: int = 24) -> ImmichGalleryResponse:
        """Fetch Immich gallery items for a PEM event by event date window."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)

        event_stmt = select(Event).where((Event.id == event_id) & (Event.user_id == user_id))
        event = (await self.session.execute(event_stmt)).scalar_one_or_none()
        if event is None:
            raise NotFoundError("Event not found")

        event_window = self._event_time_window(event)
        if event_window is None:
            return ImmichGalleryResponse(context="event", items=[])
        start, end = event_window

        payload = {
            "page": 1,
            "size": max(1, min(limit, 200)),
            "takenAfter": self._format_iso_datetime(start),
            "takenBefore": self._format_iso_datetime(end),
            "withArchived": False,
        }
        search_response = await self._request_json(base_url, api_key, "POST", "/api/search/metadata", payload)
        items = self._extract_assets(search_response)

        return ImmichGalleryResponse(
            context="event",
            items=[self._to_asset_response(base_url, asset) for asset in items],
        )

    async def gallery_for_location(self, user_id: int, location_id: int, limit: int = 24) -> ImmichGalleryResponse:
        """Fetch Immich gallery items for a location and keep only items within configured geo radius."""
        base_url, api_key = await self._get_user_immich_credentials(user_id)

        location_stmt = select(Location).where((Location.id == location_id) & (Location.user_id == user_id))
        location = (await self.session.execute(location_stmt)).scalar_one_or_none()
        if location is None:
            raise NotFoundError("Location not found")

        location_coords = self._extract_location_coordinates(location)
        if location_coords is None:
            return ImmichGalleryResponse(context="location", items=[])
        location_lat, location_lon = location_coords

        event_ids_stmt = select(LocationAssociation.entity_id).where(
            (LocationAssociation.location_id == location_id)
            & (LocationAssociation.entity_type == "event")
        )
        event_ids = [int(row[0]) for row in (await self.session.execute(event_ids_stmt)).all() if row[0] is not None]
        if not event_ids:
            return ImmichGalleryResponse(context="location", items=[])

        event_stmt = select(Event).where((Event.user_id == user_id) & (Event.id.in_(event_ids)))
        events = (await self.session.execute(event_stmt)).scalars().all()
        if not events:
            return ImmichGalleryResponse(context="location", items=[])

        all_items: list[dict[str, Any]] = []
        for event in events[:5]:
            event_window = self._event_time_window(event)
            if event_window is None:
                continue
            start, end = event_window
            payload = {
                "page": 1,
                "size": max(1, min(limit, 200)),
                "takenAfter": self._format_iso_datetime(start),
                "takenBefore": self._format_iso_datetime(end),
                "withExif": True,
                "withArchived": False,
            }
            response = await self._request_json(base_url, api_key, "POST", "/api/search/metadata", payload)
            all_items.extend(self._extract_assets(response))

        # Deduplicate and clamp
        dedup: dict[str, dict[str, Any]] = {}
        for item in all_items:
            item_id = str(item.get("id") or "")
            if not item_id:
                continue
            item_coords = self._extract_asset_coordinates(item)
            if item_coords is None:
                continue

            distance = self._distance_meters(location_lat, location_lon, item_coords[0], item_coords[1])
            if distance <= self.LOCATION_GALLERY_RADIUS_METERS:
                dedup[item_id] = item

        items = list(dedup.values())[: max(1, min(limit, 200))]
        return ImmichGalleryResponse(
            context="location",
            items=[self._to_asset_response(base_url, asset) for asset in items],
        )

    def _event_time_window(self, event: Event) -> tuple[datetime, datetime] | None:
        start = event.start_time or event.date
        end = event.end_time or event.date
        if start is None or end is None:
            return None
        if end < start:
            start, end = end, start
        return start, end

    def _format_iso_datetime(self, dt: datetime) -> str:
        """Return an ISO 8601 string for `dt` with UTC timezone (ending with 'Z')."""
        if dt is None:
            return ""
        # If naive, assume UTC to produce a trailing Z; if tz-aware, convert to UTC.
        if dt.tzinfo is None:
            dt_utc = dt.replace(tzinfo=timezone.utc)
        else:
            dt_utc = dt.astimezone(timezone.utc)
        return dt_utc.isoformat().replace("+00:00", "Z")

    def _extract_location_coordinates(self, location: Location) -> tuple[float, float] | None:
        lat = location.latitude
        lon = location.longitude
        if self._is_valid_coordinate_pair(lat, lon):
            return float(lat), float(lon)

        # Fallback for manually entered coordinates in the free-form location string.
        parsed = self._parse_coordinates_from_text(location.location)
        if parsed and self._is_valid_coordinate_pair(parsed[0], parsed[1]):
            return parsed

        return None

    def _extract_asset_coordinates(self, asset: dict[str, Any]) -> tuple[float, float] | None:
        exif_raw = asset.get("exifInfo")
        if not isinstance(exif_raw, dict):
            return None

        lat_raw = exif_raw.get("latitude")
        lon_raw = exif_raw.get("longitude")
        if lat_raw is None or lon_raw is None:
            return None

        try:
            lat_value = float(lat_raw)
            lon_value = float(lon_raw)
        except (TypeError, ValueError):
            return None

        if not self._is_valid_coordinate_pair(lat_value, lon_value):
            return None

        return lat_value, lon_value

    def _is_valid_coordinate_pair(self, lat: Any, lon: Any) -> bool:
        try:
            lat_value = float(lat)
            lon_value = float(lon)
        except (TypeError, ValueError):
            return False
        return abs(lat_value) <= 90 and abs(lon_value) <= 180

    def _parse_coordinates_from_text(self, raw_location: str | None) -> tuple[float, float] | None:
        value = str(raw_location or "").strip()
        if not value:
            return None

        # WKT POINT(lon lat)
        if value.upper().startswith("POINT") and "(" in value and ")" in value:
            inner = value[value.find("(") + 1:value.rfind(")")]
            parts = [part for part in inner.replace(",", " ").split() if part]
            if len(parts) >= 2:
                try:
                    lon = float(parts[0])
                    lat = float(parts[1])
                    if self._is_valid_coordinate_pair(lat, lon):
                        return lat, lon
                except ValueError:
                    pass

        tokens: list[float] = []
        for token in value.replace(",", " ").split():
            try:
                tokens.append(float(token))
            except ValueError:
                continue
            if len(tokens) >= 2:
                break

        if len(tokens) < 2:
            return None

        first, second = tokens[0], tokens[1]
        if self._is_valid_coordinate_pair(first, second):
            return first, second
        if self._is_valid_coordinate_pair(second, first):
            return second, first
        return None

    def _distance_meters(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6_371_000.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius * c

    async def _get_user_immich_credentials(self, user_id: int) -> tuple[str, str]:
        stmt = select(UserSettings).where(UserSettings.user_id == user_id)
        settings = (await self.session.execute(stmt)).scalar_one_or_none()

        if settings is None or not settings.immich_base_url or not settings.immich_api_key:
            raise ValidationError("Immich is not configured. Set base URL and API key in user settings.")

        return self._normalize_base_url(settings.immich_base_url), settings.immich_api_key.strip()

    def _normalize_base_url(self, base_url: str) -> str:
        value = str(base_url or "").strip().rstrip("/")
        if not value.startswith("http://") and not value.startswith("https://"):
            raise ValidationError("Immich base URL must start with http:// or https://")
        return value

    async def _request_json(
        self,
        base_url: str,
        api_key: str,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        allow_404: bool = False,
    ) -> Any:
        url = urljoin(f"{base_url}/", path.lstrip("/"))
        body = None
        headers = {
            "Accept": "application/json",
            "x-api-key": api_key,
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = Request(url, data=body, headers=headers, method=method.upper())

        def _do_request() -> Any:
            with urlopen(req, timeout=20) as response:  # noqa: S310 - URL is user-configured integration target
                raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)

        try:
            return await asyncio.to_thread(_do_request)
        except HTTPError as exc:
            if allow_404 and exc.code == 404:
                return {}
            detail = await self._read_http_error_detail(exc)
            raise ValidationError(self._format_immich_http_error(exc.code, detail))
        except URLError as exc:
            raise ValidationError(f"Immich connection failed: {exc.reason}")
        except TimeoutError:
            raise ValidationError("Immich request timed out")

    async def _request_binary(
        self,
        base_url: str,
        api_key: str,
        method: str,
        path: str,
    ) -> tuple[bytes, str]:
        url = urljoin(f"{base_url}/", path.lstrip("/"))
        headers = {
            "Accept": "image/*,application/octet-stream",
            "x-api-key": api_key,
        }
        req = Request(url, data=None, headers=headers, method=method.upper())

        def _do_request() -> tuple[bytes, str]:
            with urlopen(req, timeout=20) as response:  # noqa: S310 - URL is user-configured integration target
                content = response.read()
                content_type = response.headers.get("Content-Type") or "application/octet-stream"
            return content, content_type

        try:
            return await asyncio.to_thread(_do_request)
        except HTTPError as exc:
            detail = await self._read_http_error_detail(exc)
            raise ValidationError(self._format_immich_http_error(exc.code, detail))
        except URLError as exc:
            raise ValidationError(f"Immich connection failed: {exc.reason}")
        except TimeoutError:
            raise ValidationError("Immich request timed out")

    async def _read_http_error_detail(self, exc: HTTPError) -> str:
        def _read() -> str:
            try:
                payload = exc.read().decode("utf-8")
                return payload or exc.reason
            except Exception:
                return str(exc.reason)

        return await asyncio.to_thread(_read)

    def _format_immich_http_error(self, status_code: int, detail: str) -> str:
        raw = str(detail or "").strip()
        lowered = raw.lower()
        if status_code == 403 and "asset.view" in lowered:
            return (
                "Immich API key is missing permission 'asset.view'. "
                "Regenerate or update the Immich API key with asset viewing permissions."
            )
        return f"Immich request failed ({status_code}): {raw}"

    def _coerce_person_id(self, person: dict[str, Any]) -> str | None:
        if not isinstance(person, dict):
            return None
        value = person.get("id")
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _extract_person_image_url(self, base_url: str, person: dict[str, Any]) -> str | None:
        thumbnail_path = person.get("thumbnailPath")
        if not isinstance(thumbnail_path, str) or not thumbnail_path:
            return None
        proxied_path = thumbnail_path if thumbnail_path.startswith("http://") or thumbnail_path.startswith("https://") else urljoin(f"{base_url}/", thumbnail_path.lstrip("/"))
        return f"/api/immich/proxy-image?path={quote_plus(proxied_path)}"

    def _extract_assets(self, payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, dict):
            return []
        assets = payload.get("assets")
        if not isinstance(assets, dict):
            return []
        items = assets.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
        return []

    def _to_asset_response(self, base_url: str, item: dict[str, Any]) -> ImmichAssetResponse:
        raw_asset_id = item.get("id")
        asset_id = str(raw_asset_id or "").strip()
        original_path = item.get("originalPath")
        created_raw = item.get("fileCreatedAt") or item.get("createdAt")

        created_at = None
        if isinstance(created_raw, str) and created_raw:
            try:
                created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            except ValueError:
                created_at = None

        thumbnail_url = f"/api/immich/assets/{asset_id}/thumbnail?size=thumbnail" if asset_id else None
        preview_url = f"/api/immich/assets/{asset_id}/thumbnail?size=preview" if asset_id else None
        immich_url = f"{base_url}/photos/{asset_id}" if asset_id else None

        return ImmichAssetResponse(
            id=asset_id,
            type=item.get("type"),
            created_at=created_at,
            original_path=original_path if isinstance(original_path, str) else None,
            thumbnail_url=thumbnail_url,
            preview_url=preview_url,
            immich_url=immich_url,
        )
