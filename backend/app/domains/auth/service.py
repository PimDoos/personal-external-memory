"""Authentication domain - business logic."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
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
