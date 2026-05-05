"""Backend geocoding utilities for locations.

Nominatim usage policy compliance:
- Identify requests with a descriptive User-Agent (never default library UA).
- Include contact email in User-Agent when configured (recommended).
- Throttle requests to at most 1 request/second (configurable).
"""

from __future__ import annotations

import asyncio
import json
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import get_settings


class NominatimGeocoder:
    """Rate-limited geocoder using the Nominatim search API."""

    _lock = asyncio.Lock()
    _last_request_at = 0.0

    @classmethod
    def _build_user_agent(cls) -> str:
        settings = get_settings()
        app_name = (settings.APP_NAME or "PEM").strip().replace(" ", "-")
        app_version = (settings.APP_VERSION or "0.0.0").strip()
        contact = (settings.NOMINATIM_CONTACT_EMAIL or "").strip()

        if contact:
            return f"{app_name}/{app_version} ({contact})"
        return f"{app_name}/{app_version}"

    @classmethod
    def _is_valid_coordinate(cls, latitude: float, longitude: float) -> bool:
        return abs(latitude) <= 90 and abs(longitude) <= 180

    @classmethod
    async def _perform_search(cls, address: str) -> tuple[float, float] | None:
        settings = get_settings()
        base = settings.NOMINATIM_BASE_URL.rstrip("/")
        query = urlencode({"format": "jsonv2", "limit": 1, "q": address})
        url = f"{base}/search?{query}"

        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": cls._build_user_agent(),
            },
        )

        def _request() -> tuple[float, float] | None:
            with urlopen(request, timeout=10) as response:  # noqa: S310 - static, trusted host via config
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, list) or not payload:
                return None

            lat = float(payload[0].get("lat"))
            lon = float(payload[0].get("lon"))
            if not cls._is_valid_coordinate(lat, lon):
                return None
            return lat, lon

        try:
            return await asyncio.to_thread(_request)
        except Exception:
            return None

    @classmethod
    async def geocode(cls, address: str) -> tuple[float, float] | None:
        """Geocode an address with global in-process rate limiting."""
        normalized = str(address or "").strip()
        if not normalized:
            return None

        settings = get_settings()
        min_interval = max(0.0, float(settings.NOMINATIM_MIN_INTERVAL_SECONDS or 1.0))

        async with cls._lock:
            elapsed = time.monotonic() - cls._last_request_at
            wait_seconds = max(0.0, min_interval - elapsed)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)

            cls._last_request_at = time.monotonic()
            return await cls._perform_search(normalized)
