"""Dependency injection utilities."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.infrastructure.database import get_db
from app.infrastructure.exceptions import UnauthorizedError
from app.infrastructure.models import User


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get the current authenticated user from JWT token.
    
    Args:
        credentials: Bearer token credentials from Authorization header
        db: Database session
        
    Returns:
        Current user
        
    Raises:
        UnauthorizedError: If token is invalid or user not found
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Missing or invalid authorization header")

    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedError("Invalid token")
    except JWTError as e:
        raise UnauthorizedError(f"Invalid token: {str(e)}")

    from sqlalchemy import select
    
    stmt = select(User).where(User.id == int(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise UnauthorizedError("User not found")
    
    if not user.is_active:
        raise UnauthorizedError("User is inactive")
    
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
