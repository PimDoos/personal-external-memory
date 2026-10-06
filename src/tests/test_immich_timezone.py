from datetime import datetime

from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.domains.immich.service import ImmichService


def test_format_iso_datetime_interprets_naive_event_time_in_browser_timezone() -> None:
    service = ImmichService(None)

    formatted = service._format_iso_datetime(datetime(2025, 1, 15, 12, 0), "Europe/Helsinki")

    assert formatted == "2025-01-15T10:00:00Z"


async def test_location_gallery_finds_matching_photo_without_event_date_filter() -> None:
    location = SimpleNamespace(latitude=10.0, longitude=20.0, location="", radius=100.0)
    session = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: location)))
    service = ImmichService(session)
    service._get_user_immich_credentials = AsyncMock(return_value=("https://immich.example", "api-key"))
    service._request_json = AsyncMock(side_effect=[
        {"assets": {"items": [{"id": "not-nearby", "type": "IMAGE", "exifInfo": {"latitude": 40, "longitude": 70}}], "nextPage": "2"}},
        {"assets": {"items": [{
            "id": "older-nearby",
            "type": "IMAGE",
            "fileCreatedAt": "2010-01-01T00:00:00Z",
            "exifInfo": {"latitude": 10.0006, "longitude": 20},
        }], "nextPage": None}},
    ])

    response = await service.gallery_for_location(user_id=1, location_id=2, limit=1)

    assert [item.id for item in response.items] == ["older-nearby"]
    assert service._request_json.await_count == 2
    first_payload = service._request_json.await_args_list[0].args[4]
    second_payload = service._request_json.await_args_list[1].args[4]
    assert "takenAfter" not in first_payload
    assert "takenBefore" not in first_payload
    assert second_payload["page"] == 2