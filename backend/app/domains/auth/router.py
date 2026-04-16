"""Authentication domain - API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.schemas import (
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.domains.auth.service import AuthService
from app.infrastructure.database import get_db
from app.infrastructure.exceptions import ConflictError, UnauthorizedError
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
