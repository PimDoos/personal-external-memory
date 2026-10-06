from datetime import datetime

from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.domains.immich.service import ImmichService


def test_format_iso_datetime_interprets_naive_event_time_in_browser_timezone() -> None:
    service = ImmichService(None)

    formatted = service._format_iso_datetime(datetime(2025, 1, 15, 12, 0), "Europe/Helsinki")

    assert formatted == "2025-01-15T10:00:00Z"


async def test_location_gallery_uses_map_markers_before_fetching_nearby_assets() -> None:
    location = SimpleNamespace(latitude=10.0, longitude=20.0, location="", radius=100.0)
    session = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: location)))
    service = ImmichService(session)
    service._get_user_immich_credentials = AsyncMock(return_value=("https://immich.example", "api-key"))
    service._request_json = AsyncMock(side_effect=[
        [
            {"id": "not-nearby", "lat": 40, "lon": 70},
            {"id": "nearby-video", "lat": 10.0003, "lon": 20},
            {"id": "nearby-photo", "lat": 10.0006, "lon": 20},
        ],
        {"id": "nearby-video", "type": "VIDEO", "fileCreatedAt": "2025-01-01T00:00:00Z"},
        {
            "id": "nearby-photo",
            "type": "IMAGE",
            "fileCreatedAt": "2010-01-01T00:00:00Z",
            "originalPath": "/photo.jpg",
        },
    ])

    response = await service.gallery_for_location(user_id=1, location_id=2, limit=1)

    assert [item.id for item in response.items] == ["nearby-photo"]
    assert service._request_json.await_count == 3
    assert service._request_json.await_args_list[0].args[3] == "/api/map/markers?isArchived=false"
    assert [call.args[3] for call in service._request_json.await_args_list[1:]] == [
        "/api/assets/nearby-video",
        "/api/assets/nearby-photo",
    ]