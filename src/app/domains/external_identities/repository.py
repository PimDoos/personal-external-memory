"""External identities domain - data access layer."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.models import ExternalIdentity, ExternalIdentityAssociation
from app.infrastructure.repository import BaseRepository


class ExternalIdentityRepository(BaseRepository[ExternalIdentity]):
    """Repository for ExternalIdentity model."""

    def __init__(self, session: AsyncSession):
        """Initialize external identity repository."""
        super().__init__(session, ExternalIdentity)

    async def list_by_user(
        self, user_id: int, skip: int = 0, limit: int | None = None
    ) -> list[ExternalIdentity]:
        """List external identities for a user."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .offset(skip)
            .order_by(self.model.source.asc(), self.model.display_name.asc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_external_key(
        self, user_id: int, source: str, external_id: str
    ) -> ExternalIdentity | None:
        """Get external identity by source + external id."""
        stmt = select(self.model).where(
            (self.model.user_id == user_id)
            & (self.model.source == source)
            & (self.model.external_id == external_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class ExternalIdentityAssociationRepository(BaseRepository[ExternalIdentityAssociation]):
    """Repository for ExternalIdentityAssociation model."""

    def __init__(self, session: AsyncSession):
        """Initialize association repository."""
        super().__init__(session, ExternalIdentityAssociation)

    async def list_for_external_identity(
        self, external_identity_id: int
    ) -> list[ExternalIdentityAssociation]:
        """List associations for an external identity."""
        stmt = (
            select(self.model)
            .where(self.model.external_identity_id == external_identity_id)
            .order_by(self.model.created_at.desc(), self.model.id.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_existing(
        self, external_identity_id: int, entity_type: str, entity_id: int
    ) -> ExternalIdentityAssociation | None:
        """Find existing association for deduplication."""
        stmt = select(self.model).where(
            (self.model.external_identity_id == external_identity_id)
            & (self.model.entity_type == entity_type)
            & (self.model.entity_id == entity_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
