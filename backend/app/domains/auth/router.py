"""Authentication domain - API routes."""

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.schemas import (
    OpenIdAuthorizationUrlResponse,
    OpenIdConfigResponse,
    TokenRefreshRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.domains.auth.service import AuthService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser
from app.infrastructure.models import User

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register(
    request: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Register a new user.
    
    Args:
        request: Registration request with email and password
        db: Database session
        
    Returns:
        Created user
        
    Raises:
        ConflictError: If email is already registered
    """
    service = AuthService(db)
    user = await service.register(email=request.email, password=request.password)
    await db.commit()
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Login a user.
    
    Args:
        request: Login request with email and password
        db: Database session
        
    Returns:
        Access and refresh tokens
        
    Raises:
        UnauthorizedError: If credentials are invalid
    """
    service = AuthService(db)
    user, access_token, refresh_token = await service.login(
        email=request.email, password=request.password
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Refresh an access token using a refresh token."""
    service = AuthService(db)
    _, access_token, refresh_token_value = await service.refresh_access_token(
        refresh_token=request.refresh_token
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token_value)


@router.get("/openid/config", response_model=OpenIdConfigResponse)
async def openid_config(
    db: AsyncSession = Depends(get_db),
) -> OpenIdConfigResponse:
    """Return OpenID SSO configuration for frontend rendering."""
    service = AuthService(db)
    return OpenIdConfigResponse(
        enabled=service.is_openid_enabled(),
        button_text=service.openid_button_text(),
    )


@router.get("/openid/login-url", response_model=OpenIdAuthorizationUrlResponse)
async def openid_login_url(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> OpenIdAuthorizationUrlResponse:
    """Build OpenID authorization URL for login flow."""
    service = AuthService(db)
    callback_url = str(request.url_for("openid_callback"))
    url = await service.create_openid_authorization_url("login", callback_url)
    return OpenIdAuthorizationUrlResponse(authorization_url=url)


@router.post("/openid/link-url", response_model=OpenIdAuthorizationUrlResponse)
async def openid_link_url(
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OpenIdAuthorizationUrlResponse:
    """Build OpenID authorization URL for account-link flow."""
    service = AuthService(db)
    callback_url = str(request.url_for("openid_callback"))
    url = await service.create_openid_authorization_url(
        "link",
        callback_url,
        user_id=current_user.id,
    )
    return OpenIdAuthorizationUrlResponse(authorization_url=url)


@router.get("/openid/callback", name="openid_callback", response_class=HTMLResponse)
async def openid_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Handle OpenID callback and redirect with result."""
    service = AuthService(db)

    if error:
        error_msg = f"OpenID error: {error_description or error}"
        encoded_error = json.dumps({"error": error_msg}).replace('"', '\\"')
        html = f"""<!doctype html>
<html>
<body>
<script>
  localStorage.setItem('openid_error', '{encoded_error}');
  window.location.href = '/';
</script>
</body>
</html>
"""
        return HTMLResponse(content=html)

    if not code or not state:
        error_msg = "OpenID callback is missing required parameters."
        encoded_error = json.dumps({"error": error_msg}).replace('"', '\\"')
        html = f"""<!doctype html>
<html>
<body>
<script>
  localStorage.setItem('openid_error', '{encoded_error}');
  window.location.href = '/';
</script>
</body>
</html>
"""
        return HTMLResponse(content=html)

    try:
        result = await service.complete_openid_callback(code, state)
        await db.commit()
        action = str(result.get("action", "login"))
        
        if action == "link":
            html = """<!doctype html>
<html>
<body>
<script>
  localStorage.setItem('openid_link_success', 'true');
  window.location.href = '/#section=settings';
</script>
</body>
</html>
"""
            return HTMLResponse(content=html)
        
        callback_data = {
            "access_token": result.get("access_token"),
            "refresh_token": result.get("refresh_token"),
            "email": result.get("email"),
        }
        encoded_data = json.dumps(callback_data).replace('"', '\\"')
        html = f"""<!doctype html>
<html>
<body>
<script>
  localStorage.setItem('openid_callback', '{encoded_data}');
  window.location.href = '/';
</script>
</body>
</html>
"""
        return HTMLResponse(content=html)
    except Exception as exc:
        await db.rollback()
        error_msg = str(exc)
        encoded_error = json.dumps({"error": error_msg}).replace('"', '\\"')
        html = f"""<!doctype html>
<html>
<body>
<script>
  localStorage.setItem('openid_error', '{encoded_error}');
  window.location.href = '/';
</script>
</body>
</html>
"""
        return HTMLResponse(content=html)


@router.delete("/openid/link")
async def unlink_openid(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Unlink currently authenticated user from OpenID account."""
    service = AuthService(db)
    await service.unlink_openid(current_user.id)
    await db.commit()
    return {"message": "OpenID account unlinked"}
