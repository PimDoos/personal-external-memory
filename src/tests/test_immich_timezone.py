from datetime import date, datetime

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.domains.immich.service import ImmichService
from app.infrastructure.exceptions import ValidationError


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


async def test_birthdate_sync_writes_only_when_immich_birthdate_is_missing() -> None:
    service = ImmichService(None)
    service._get_remote_birthdate = AsyncMock(return_value=None)
    service._write_birthdate = AsyncMock()
    birthdate = date(1990, 5, 6)

    written = await service._write_birthdate_if_missing(
        "https://immich.example", "api-key", "immich-person", birthdate
    )

    assert written is True
    service._write_birthdate.assert_awaited_once_with(
        "https://immich.example", "api-key", "immich-person", birthdate
    )


async def test_birthdate_sync_preserves_existing_immich_birthdate() -> None:
    service = ImmichService(None)
    service._get_remote_birthdate = AsyncMock(return_value=date(1988, 2, 3))
    service._write_birthdate = AsyncMock()

    written = await service._write_birthdate_if_missing(
        "https://immich.example", "api-key", "immich-person", date(1990, 5, 6)
    )

    assert written is False
    service._write_birthdate.assert_not_awaited()


async def test_sync_faces_writes_missing_birthdate_for_linked_person() -> None:
    identity = SimpleNamespace(id=10)
    linked_birthdate = date(1990, 5, 6)
    session = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            SimpleNamespace(scalar_one_or_none=lambda: True),
            SimpleNamespace(scalar_one_or_none=lambda: identity),
            SimpleNamespace(scalar_one_or_none=lambda: linked_birthdate),
        ]),
        add=lambda item: None,
        flush=AsyncMock(),
    )
    service = ImmichService(session)
    service._get_user_immich_credentials = AsyncMock(
        return_value=("https://immich.example", "api-key")
    )
    service._request_json = AsyncMock(side_effect=[
        {"people": [{"id": "immich-person", "name": "PEM Person"}]},
        {"birthDate": None},
        {},
    ])

    await service.sync_faces(user_id=1)

    assert service._request_json.await_args_list[1].args[2:4] == (
        "GET",
        "/api/people/immich-person",
    )
    assert service._request_json.await_args_list[2].args[2:5] == (
        "PUT",
        "/api/people/immich-person",
        {"birthDate": "1990-05-06"},
    )


async def test_pem_birthdate_edit_only_updates_matching_immich_value() -> None:
    settings = SimpleNamespace(immich_birthdate_sync_enabled=True)
    session = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            SimpleNamespace(scalar_one_or_none=lambda: settings),
            SimpleNamespace(scalar_one_or_none=lambda: "immich-person"),
        ])
    )
    service = ImmichService(session)
    service._get_user_immich_credentials = AsyncMock(
        return_value=("https://immich.example", "api-key")
    )
    service._get_remote_birthdate = AsyncMock(return_value=date(1988, 2, 3))
    service._write_birthdate = AsyncMock()

    updated = await service.update_linked_birthdate_if_unchanged(
        user_id=1,
        person_id=2,
        previous_birthdate=date(1988, 2, 3),
        new_birthdate=date(1990, 5, 6),
    )

    assert updated is True
    service._write_birthdate.assert_awaited_once_with(
        "https://immich.example", "api-key", "immich-person", date(1990, 5, 6)
    )


async def test_pem_birthdate_edit_does_not_overwrite_different_immich_value() -> None:
    settings = SimpleNamespace(immich_birthdate_sync_enabled=True)
    session = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            SimpleNamespace(scalar_one_or_none=lambda: settings),
            SimpleNamespace(scalar_one_or_none=lambda: "immich-person"),
        ])
    )
    service = ImmichService(session)
    service._get_user_immich_credentials = AsyncMock(
        return_value=("https://immich.example", "api-key")
    )
    service._get_remote_birthdate = AsyncMock(return_value=date(1987, 2, 3))
    service._write_birthdate = AsyncMock()

    updated = await service.update_linked_birthdate_if_unchanged(
        user_id=1,
        person_id=2,
        previous_birthdate=date(1988, 2, 3),
        new_birthdate=date(1990, 5, 6),
    )

    assert updated is False
    service._write_birthdate.assert_not_awaited()


async def test_birthdate_write_error_identifies_permission_failures() -> None:
    service = ImmichService(None)
    service._request_json = AsyncMock(
        side_effect=ValidationError("Immich request failed (403): Forbidden")
    )

    with pytest.raises(ValidationError, match="likely a permissions issue"):
        await service._write_birthdate(
            "https://immich.example", "api-key", "immich-person", date(1990, 5, 6)
        )