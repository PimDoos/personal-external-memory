"""Configuration settings for the application."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Personal External Memory"
    APP_VERSION: str = "0.1.0"
    APP_DESCRIPTION: str = "Personal relationship management system"
    DEBUG: bool = False

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./pem.db"

    # Security
    SECRET_KEY: str = "change-me-in-production-with-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:8080",
    ]

    # Logging
    LOG_LEVEL: str = "INFO"

    # Geocoding (Nominatim)
    NOMINATIM_BASE_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_CONTACT_EMAIL: str = ""
    NOMINATIM_MIN_INTERVAL_SECONDS: float = 1.0

    # Optional integrations
    GOOGLE_CALENDAR_API_KEY: Optional[str] = None
    OUTLOOK_API_KEY: Optional[str] = None
    IMMICH_API_URL: Optional[str] = None
    IMMICH_API_KEY: Optional[str] = None

    # OpenID Connect SSO (optional)
    OPENID_ISSUER_URL: Optional[str] = None
    OPENID_CLIENT_ID: Optional[str] = None
    OPENID_CLIENT_SECRET: Optional[str] = None
    OPENID_SSO_BUTTON_TEXT: str = "Sign in with SSO"

    class Config:
        """Pydantic config."""

        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
