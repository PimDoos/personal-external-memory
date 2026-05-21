"""External identities domain - business logic."""

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.external_identities.schemas import (
    ExternalIdentityAssociationCreateRequest,
    ExternalIdentityCreateRequest,
    ExternalIdentityUpdateRequest,
)
from app.infrastructure.exceptions import ConflictError, NotFoundError, ValidationError
from app.infrastructure.models import (
    Brand,
    Event,
    ExternalIdentity,
    ExternalIdentityAssociation,
    Person,
    SocialCircle,
)


class ExternalIdentityService:
    """Service for managing external identities and associations."""

    ALLOWED_EXTERNAL_ENTITY_TYPES = {"person", "location", "event", "image", "text"}
    ALLOWED_ASSOCIATION_ENTITY_TYPES = {"person", "social_circle", "brand", "event"}

    def __init__(self, session: AsyncSession):
        """Initialize external identity service."""
        self.session = session

    async def create(self, user_id: int, data: ExternalIdentityCreateRequest) -> ExternalIdentity:
        """Create an external identity."""
        self._validate_external_entity_type(data.entity_type)

        stmt = select(ExternalIdentity).where(
            (ExternalIdentity.user_id == user_id)
            & (ExternalIdentity.source == data.source)
            & (ExternalIdentity.external_id == data.external_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("External identity with this source and external ID already exists")

        identity = ExternalIdentity(
            user_id=user_id,
            display_name=data.display_name,
            external_id=data.external_id,
            source=data.source,
            entity_type=data.entity_type,
            click_uri=data.click_uri,
            start_date=data.start_date,
            end_date=data.end_date,
            image_url=data.image_url,
            latitude=data.latitude,
            longitude=data.longitude,
            content=data.content,
            is_read_only=data.is_read_only,
        )
        self.session.add(identity)
        await self.session.flush()
        return identity

    async def get(self, external_identity_id: int, user_id: int) -> ExternalIdentity:
        """Get an external identity by ID with ownership check."""
        stmt = select(ExternalIdentity).where(
            (ExternalIdentity.id == external_identity_id)
            & (ExternalIdentity.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        identity = result.scalar_one_or_none()
        if not identity:
            raise NotFoundError("External identity not found")
        return identity

    async def update(
        self,
        external_identity_id: int,
        user_id: int,
        data: ExternalIdentityUpdateRequest,
    ) -> ExternalIdentity:
        """Update an external identity."""
        identity = await self.get(external_identity_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(identity, key, value)

        await self.session.flush()
        return identity

    async def delete(self, external_identity_id: int, user_id: int) -> None:
        """Delete an external identity and all its associations."""
        identity = await self.get(external_identity_id, user_id)
        await self.session.delete(identity)
        await self.session.flush()

    async def add_association(
        self,
        external_identity_id: int,
        user_id: int,
        data: ExternalIdentityAssociationCreateRequest,
    ) -> ExternalIdentityAssociation:
        """Associate an external identity with an internal entity."""
        identity = await self.get(external_identity_id, user_id)
        self._validate_association_entity_type(data.entity_type)
        await self._validate_entity_ownership(data.entity_type, data.entity_id, user_id)

        stmt = select(ExternalIdentityAssociation).where(
            (ExternalIdentityAssociation.external_identity_id == identity.id)
            & (ExternalIdentityAssociation.entity_type == data.entity_type)
            & (ExternalIdentityAssociation.entity_id == data.entity_id)
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ConflictError("Association already exists")

        # Business rule: a person can have only one linked Immich face.
        if (
            data.entity_type == "person"
            and identity.source == "immich"
            and identity.entity_type == "person"
        ):
            existing_face_link_stmt = (
                select(ExternalIdentityAssociation)
                .join(
                    ExternalIdentity,
                    ExternalIdentity.id == ExternalIdentityAssociation.external_identity_id,
                )
                .where(
                    (ExternalIdentity.user_id == user_id)
                    & (ExternalIdentityAssociation.entity_type == "person")
                    & (ExternalIdentityAssociation.entity_id == data.entity_id)
                    & (ExternalIdentity.source == "immich")
                    & (ExternalIdentity.entity_type == "person")
                    & (ExternalIdentityAssociation.external_identity_id != identity.id)
                )
            )
            existing_face_link = (
                await self.session.execute(existing_face_link_stmt)
            ).scalar_one_or_none()
            if existing_face_link:
                raise ConflictError("Person already has a linked Immich face")

        association = ExternalIdentityAssociation(
            external_identity_id=identity.id,
            entity_type=data.entity_type,
            entity_id=data.entity_id,
        )
        self.session.add(association)
        await self.session.flush()
        return association

    async def remove_association(
        self,
        external_identity_id: int,
        association_id: int,
        user_id: int,
    ) -> None:
        """Remove a specific association from an external identity."""
        await self.get(external_identity_id, user_id)

        stmt = select(ExternalIdentityAssociation).where(
            (ExternalIdentityAssociation.id == association_id)
            & (ExternalIdentityAssociation.external_identity_id == external_identity_id)
        )
        result = await self.session.execute(stmt)
        association = result.scalar_one_or_none()
        if not association:
            raise NotFoundError("Association not found")

        await self.session.delete(association)
        await self.session.flush()

    async def list_associations(
        self, external_identity_id: int, user_id: int
    ) -> list[ExternalIdentityAssociation]:
        """List associations for an external identity."""
        await self.get(external_identity_id, user_id)
        stmt = select(ExternalIdentityAssociation).where(
            ExternalIdentityAssociation.external_identity_id == external_identity_id
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_immich_person_faces_for_linking(
        self,
        user_id: int,
        person_id: int | None = None,
    ) -> list[dict]:
        """Return minimal Immich person-face identities and optional link info for one person."""
        association_join_condition = and_(
            ExternalIdentityAssociation.external_identity_id == ExternalIdentity.id,
            ExternalIdentityAssociation.entity_type == "person",
        )

        stmt = (
            select(
                ExternalIdentity.id,
                ExternalIdentity.external_id,
                ExternalIdentity.display_name,
                ExternalIdentity.image_url,
                ExternalIdentity.click_uri,
                ExternalIdentityAssociation.id.label("linked_association_id"),
                ExternalIdentityAssociation.entity_id.label("linked_person_id"),
            )
            .select_from(ExternalIdentity)
            .outerjoin(
                ExternalIdentityAssociation,
                association_join_condition,
            )
            .where(
                (ExternalIdentity.user_id == user_id)
                & (ExternalIdentity.source == "immich")
                & (ExternalIdentity.entity_type == "person")
            )
            .order_by(ExternalIdentity.display_name.asc(), ExternalIdentity.id.asc())
        )

        rows = (await self.session.execute(stmt)).all()
        return [
            {
                "id": row.id,
                "external_id": row.external_id,
                "display_name": row.display_name,
                "image_url": row.image_url,
                "click_uri": row.click_uri,
                "linked_association_id": row.linked_association_id,
                "linked_person_id": row.linked_person_id,
            }
            for row in rows
        ]

    def _validate_external_entity_type(self, entity_type: str) -> None:
        if entity_type not in self.ALLOWED_EXTERNAL_ENTITY_TYPES:
            raise ValidationError(
                f"Invalid external entity_type '{entity_type}'. Allowed: {sorted(self.ALLOWED_EXTERNAL_ENTITY_TYPES)}"
            )

    def _validate_association_entity_type(self, entity_type: str) -> None:
        if entity_type not in self.ALLOWED_ASSOCIATION_ENTITY_TYPES:
            raise ValidationError(
                f"Invalid association entity_type '{entity_type}'. Allowed: {sorted(self.ALLOWED_ASSOCIATION_ENTITY_TYPES)}"
            )

    async def _validate_entity_ownership(
        self, entity_type: str, entity_id: int, user_id: int
    ) -> None:
        model_map = {
            "person": Person,
            "social_circle": SocialCircle,
            "brand": Brand,
            "event": Event,
        }
        model = model_map[entity_type]

        stmt = select(model).where((model.id == entity_id) & (model.user_id == user_id))
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            raise NotFoundError(f"{entity_type} not found")
