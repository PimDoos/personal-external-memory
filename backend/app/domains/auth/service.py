"""Authentication domain - business logic."""

import base64
import hashlib
import json
import secrets
from datetime import timedelta
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urljoin
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    decode_token,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.infrastructure.exceptions import ConflictError, UnauthorizedError, ValidationError
from app.infrastructure.models import User


class AuthService:
    """Authentication service."""

    def __init__(self, session: AsyncSession):
        """Initialize auth service.
        
        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    def is_openid_enabled(self) -> bool:
        settings = get_settings()
        return bool(
            str(settings.OPENID_ISSUER_URL or "").strip()
            and str(settings.OPENID_CLIENT_ID or "").strip()
            and str(settings.OPENID_CLIENT_SECRET or "").strip()
        )

    def openid_button_text(self) -> str:
        settings = get_settings()
        text = str(settings.OPENID_SSO_BUTTON_TEXT or "").strip()
        return text or "Sign in with SSO"

    def _encode_openid_state(self, payload: dict[str, Any]) -> str:
        settings = get_settings()
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    def _decode_openid_state(self, token: str) -> dict[str, Any]:
        settings = get_settings()
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        expires_at = payload.get("exp")
        if not isinstance(expires_at, (int, float)):
            raise ValidationError("Invalid OpenID state")
        if datetime.now(timezone.utc).timestamp() > float(expires_at):
            raise ValidationError("OpenID session expired")
        return payload

    def _pkce_code_challenge(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    async def _request_json(self, url: str, method: str = "GET", payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
        request_headers = dict(headers or {})
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        req = Request(url, data=body, headers=request_headers, method=method.upper())

        def _do_request() -> dict[str, Any]:
            with urlopen(req, timeout=20) as response:  # noqa: S310
                raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            if not isinstance(data, dict):
                raise ValidationError("OpenID response was not an object")
            return data

        try:
            import asyncio

            return await asyncio.to_thread(_do_request)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValidationError(f"OpenID HTTP error ({exc.code}): {detail or exc.reason}")
        except URLError as exc:
            raise ValidationError(f"OpenID connection failed: {exc.reason}")

    async def _request_form_json(self, url: str, form_payload: dict[str, str]) -> dict[str, Any]:
        encoded_form = urlencode(form_payload).encode("utf-8")
        req = Request(
            url,
            data=encoded_form,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

        def _do_request() -> dict[str, Any]:
            with urlopen(req, timeout=20) as response:  # noqa: S310
                raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            if not isinstance(data, dict):
                raise ValidationError("OpenID token response was not an object")
            return data

        try:
            import asyncio

            return await asyncio.to_thread(_do_request)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValidationError(f"OpenID token exchange failed ({exc.code}): {detail or exc.reason}")
        except URLError as exc:
            raise ValidationError(f"OpenID connection failed: {exc.reason}")

    async def discover_openid_metadata(self) -> dict[str, Any]:
        settings = get_settings()
        issuer = str(settings.OPENID_ISSUER_URL or "").strip().rstrip("/")
        if not issuer:
            raise ValidationError("OpenID is not configured")
        metadata_url = urljoin(f"{issuer}/", ".well-known/openid-configuration")
        metadata = await self._request_json(metadata_url)
        if not metadata.get("authorization_endpoint") or not metadata.get("token_endpoint"):
            raise ValidationError("OpenID metadata missing required endpoints")
        return metadata

    async def create_openid_authorization_url(self, action: str, redirect_uri: str, user_id: int | None = None) -> str:
        if action not in {"login", "link"}:
            raise ValidationError("Invalid OpenID action")
        if action == "link" and not user_id:
            raise ValidationError("OpenID link requires an authenticated user")
        if not self.is_openid_enabled():
            raise ValidationError("OpenID SSO is not configured")

        settings = get_settings()
        metadata = await self.discover_openid_metadata()
        verifier = secrets.token_urlsafe(64)
        challenge = self._pkce_code_challenge(verifier)
        now_ts = datetime.now(timezone.utc).timestamp()
        state_token = self._encode_openid_state(
            {
                "typ": "openid_state",
                "act": action,
                "uid": int(user_id) if user_id else None,
                "cv": verifier,
                "rdu": redirect_uri,
                "iat": int(now_ts),
                "exp": int(now_ts + 600),
            }
        )

        params = {
            "client_id": str(settings.OPENID_CLIENT_ID),
            "response_type": "code",
            "scope": "openid email profile",
            "redirect_uri": redirect_uri,
            "state": state_token,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{metadata['authorization_endpoint']}?{urlencode(params)}"

    async def _resolve_openid_identity(self, metadata: dict[str, Any], access_token: str, id_token: str | None = None) -> dict[str, Any]:
        userinfo_endpoint = metadata.get("userinfo_endpoint")
        if isinstance(userinfo_endpoint, str) and userinfo_endpoint.strip():
            userinfo = await self._request_json(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            subject = userinfo.get("sub")
            if subject:
                return {
                    "sub": str(subject),
                    "email": str(userinfo.get("email") or "").strip() or None,
                    "issuer": str(metadata.get("issuer") or "").strip(),
                }

        if id_token:
            claims = jwt.get_unverified_claims(id_token)
            subject = claims.get("sub")
            if subject:
                return {
                    "sub": str(subject),
                    "email": str(claims.get("email") or "").strip() or None,
                    "issuer": str(claims.get("iss") or metadata.get("issuer") or "").strip(),
                }

        raise ValidationError("OpenID identity did not include a subject")

    async def complete_openid_callback(self, code: str, state_token: str) -> dict[str, Any]:
        if not self.is_openid_enabled():
            raise ValidationError("OpenID SSO is not configured")

        settings = get_settings()
        state = self._decode_openid_state(state_token)
        if state.get("typ") != "openid_state":
            raise ValidationError("Invalid OpenID state")

        action = str(state.get("act") or "")
        code_verifier = str(state.get("cv") or "")
        redirect_uri = str(state.get("rdu") or "")
        state_user_id = state.get("uid")

        if action not in {"login", "link"}:
            raise ValidationError("Invalid OpenID action")
        if not code_verifier or not redirect_uri:
            raise ValidationError("OpenID state payload is incomplete")

        metadata = await self.discover_openid_metadata()
        token_payload = await self._request_form_json(
            str(metadata["token_endpoint"]),
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": str(settings.OPENID_CLIENT_ID),
                "client_secret": str(settings.OPENID_CLIENT_SECRET),
                "code_verifier": code_verifier,
            },
        )

        access_token = str(token_payload.get("access_token") or "")
        id_token = str(token_payload.get("id_token") or "") or None
        if not access_token:
            raise ValidationError("OpenID token exchange did not return access token")

        identity = await self._resolve_openid_identity(metadata, access_token, id_token)
        subject = identity["sub"]
        issuer = identity["issuer"] or str(metadata.get("issuer") or "").strip()
        email = identity.get("email")
        if not issuer:
            raise ValidationError("OpenID issuer is missing")

        existing_stmt = select(User).where(
            (User.openid_issuer == issuer) & (User.openid_subject == subject)
        )
        existing_link = (await self.session.execute(existing_stmt)).scalar_one_or_none()

        if action == "link":
            if not state_user_id:
                raise ValidationError("OpenID link state is missing user context")
            user_stmt = select(User).where(User.id == int(state_user_id))
            user = (await self.session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                raise UnauthorizedError("User not found for OpenID linking")

            if existing_link and existing_link.id != user.id:
                raise ConflictError("OpenID account is already linked to another user")

            user.openid_issuer = issuer
            user.openid_subject = subject
            user.openid_email = email
            await self.session.flush()
            await self.session.refresh(user)

            return {
                "action": "link",
                "status": "success",
                "message": "OpenID account linked.",
                "email": user.email,
            }

        if existing_link:
            user = existing_link
            if email:
                user.openid_email = email
                await self.session.flush()
        else:
            user = None
            if email:
                by_email_stmt = select(User).where(User.email == email)
                user = (await self.session.execute(by_email_stmt)).scalar_one_or_none()

            if user is None:
                if not email:
                    raise ValidationError("OpenID provider did not return an email for new account creation")
                random_password = secrets.token_urlsafe(32)
                user = User(email=email, hashed_password=hash_password(random_password))
                self.session.add(user)
                await self.session.flush()

            user.openid_issuer = issuer
            user.openid_subject = subject
            user.openid_email = email
            await self.session.flush()
            await self.session.refresh(user)

        if not user.is_active:
            raise UnauthorizedError("User account is inactive")

        new_access_token = create_access_token(data={"sub": str(user.id)})
        new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
        return {
            "action": "login",
            "status": "success",
            "message": "Signed in with OpenID.",
            "email": user.email,
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
        }

    async def unlink_openid(self, user_id: int) -> User:
        user_stmt = select(User).where(User.id == int(user_id))
        user = (await self.session.execute(user_stmt)).scalar_one_or_none()
        if not user:
            raise UnauthorizedError("User not found")

        user.openid_issuer = None
        user.openid_subject = None
        user.openid_email = None
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def register(self, email: str, password: str) -> User:
        """Register a new user.
        
        Args:
            email: User email
            password: User password (plain text)
            
        Returns:
            Created user
            
        Raises:
            ConflictError: If email already exists
            ValidationError: If password is too short
        """
        # Validate password
        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters long")

        # Check if user already exists
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise ConflictError("Email already registered")

        # Create new user
        hashed_password = hash_password(password)
        user = User(email=email, hashed_password=hashed_password)
        self.session.add(user)
        await self.session.flush()

        return user

    async def login(self, email: str, password: str) -> tuple[User, str, str]:
        """Login a user.
        
        Args:
            email: User email
            password: User password (plain text)
            
        Returns:
            Tuple of (user, access_token, refresh_token)
            
        Raises:
            UnauthorizedError: If credentials are invalid
        """
        # Find user by email
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise UnauthorizedError("Invalid email or password")

        # Verify password
        if not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise UnauthorizedError("User account is inactive")

        # Create tokens
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})

        return user, access_token, refresh_token

    async def refresh_access_token(self, refresh_token: str) -> tuple[User, str, str]:
        """Refresh access token using a valid refresh token.

        Args:
            refresh_token: JWT refresh token

        Returns:
            Tuple of (user, new_access_token, new_refresh_token)

        Raises:
            UnauthorizedError: If refresh token is invalid or user cannot be authenticated
        """
        try:
            payload = decode_token(refresh_token)
        except JWTError as error:
            raise UnauthorizedError(f"Invalid refresh token: {str(error)}")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedError("Invalid refresh token")

        stmt = select(User).where(User.id == int(user_id))
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise UnauthorizedError("User not found")
        if not user.is_active:
            raise UnauthorizedError("User account is inactive")

        new_access_token = create_access_token(data={"sub": str(user.id)})
        new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
        return user, new_access_token, new_refresh_token
