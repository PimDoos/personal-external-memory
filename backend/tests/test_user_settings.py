"""Tests for user settings endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import create_app


def register_and_login(client: TestClient, email: str, password: str) -> dict[str, str]:
    """Create a user and return auth headers."""
    register_response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert register_response.status_code == 200

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


def test_user_settings_roundtrip() -> None:
    """Settings should load defaults and persist updates."""
    app = create_app()
    client = TestClient(app)

    headers = register_and_login(
        client,
        email=f"settings-{uuid4().hex}@example.com",
        password="securepassword123",
    )

    initial_response = client.get("/api/user-settings", headers=headers)
    assert initial_response.status_code == 200
    assert initial_response.json() == {
        "me_person_id": None,
        "immich_api_key": None,
        "immich_base_url": None,
        "home_assistant_api_key": None,
        "home_assistant_base_url": None,
    }

    person_response = client.post(
        "/api/people",
        json={"first_name": "Pem", "last_name": "Owner"},
        headers=headers,
    )
    assert person_response.status_code == 200
    person_id = person_response.json()["id"]

    update_response = client.put(
        "/api/user-settings",
        json={
            "me_person_id": person_id,
            "immich_api_key": "immich-secret",
            "immich_base_url": "https://immich.local",
            "home_assistant_api_key": "ha-secret",
            "home_assistant_base_url": "https://ha.local",
        },
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["me_person_id"] == person_id

    refreshed_response = client.get("/api/user-settings", headers=headers)
    assert refreshed_response.status_code == 200
    assert refreshed_response.json() == {
        "me_person_id": person_id,
        "immich_api_key": "immich-secret",
        "immich_base_url": "https://immich.local",
        "home_assistant_api_key": "ha-secret",
        "home_assistant_base_url": "https://ha.local",
    }


def test_user_settings_rejects_foreign_me_person_id() -> None:
    """Users cannot set me_person_id to a person owned by another user."""
    app = create_app()
    client = TestClient(app)

    user_one_headers = register_and_login(
        client,
        email=f"settings-owner-{uuid4().hex}@example.com",
        password="securepassword123",
    )
    user_two_headers = register_and_login(
        client,
        email=f"settings-other-{uuid4().hex}@example.com",
        password="securepassword123",
    )

    person_response = client.post(
        "/api/people",
        json={"first_name": "User", "last_name": "One"},
        headers=user_one_headers,
    )
    assert person_response.status_code == 200
    foreign_person_id = person_response.json()["id"]

    update_response = client.put(
        "/api/user-settings",
        json={"me_person_id": foreign_person_id},
        headers=user_two_headers,
    )
    assert update_response.status_code == 422
    assert "Selected person does not belong to current user" in update_response.json()["detail"]
