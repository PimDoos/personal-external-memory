"""Authentication domain - schemas for request/response validation."""

from pydantic import BaseModel, EmailStr


class UserRegisterRequest(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str


class UserLoginRequest(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class TokenResponse(BaseModel):
    """Token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User response (without password)."""

    id: int
    email: str
    is_active: bool

    class Config:
        """Pydantic config."""

        from_attributes = True
