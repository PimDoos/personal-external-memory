"""Brands domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.brands.schemas import BrandCreateRequest, BrandDetailResponse, BrandListResponse, BrandUpdateRequest
from app.infrastructure.models import Brand, BrandAssociation, LocationAssociation
from app.infrastructure.exceptions import NotFoundError


class BrandService:
    """Service for managing brands."""

    def __init__(self, session: AsyncSession):
        """Initialize brand service."""
        self.session = session

    async def create(self, user_id: int, data: BrandCreateRequest) -> Brand:
        """Create a new brand."""
        brand = Brand(
            user_id=user_id,
            name=data.name,
            description=data.description,
            notes=data.notes,
        )
        self.session.add(brand)
        await self.session.flush()
        await self.session.refresh(brand)
        return brand

    async def get(self, brand_id: int, user_id: int) -> Brand:
        """Get a brand by ID."""
        stmt = select(Brand).where(
            (Brand.id == brand_id) & (Brand.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        brand = result.scalar_one_or_none()

        if not brand:
            raise NotFoundError("Brand not found")

        return brand

    async def update(self, brand_id: int, user_id: int, data: BrandUpdateRequest) -> Brand:
        """Update a brand."""
        brand = await self.get(brand_id, user_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(brand, key, value)

        await self.session.flush()
        await self.session.refresh(brand)
        return brand

    async def delete(self, brand_id: int, user_id: int) -> None:
        """Delete a brand."""
        brand = await self.get(brand_id, user_id)
        await self.session.delete(brand)
        await self.session.flush()

    async def _related_maps(self, brand_ids: list[int]) -> dict[str, dict[int, list]]:
        if not brand_ids:
            return {"members": {}, "location_ids": {}}

        members = {brand_id: [] for brand_id in brand_ids}
        location_ids = {brand_id: [] for brand_id in brand_ids}

        member_rows = (
            await self.session.execute(
                select(BrandAssociation).where(BrandAssociation.brand_id.in_(brand_ids))
            )
        ).scalars().all()
        for member in member_rows:
            members[member.brand_id].append(
                {
                    "brand_id": member.brand_id,
                    "person_id": member.person_id,
                    "type": member.type,
                }
            )

        location_rows = (
            await self.session.execute(
                select(LocationAssociation.entity_id, LocationAssociation.location_id).where(
                    LocationAssociation.entity_type == "brand",
                    LocationAssociation.entity_id.in_(brand_ids),
                )
            )
        ).all()
        for brand_id, location_id in location_rows:
            location_ids[brand_id].append(location_id)

        return {"members": members, "location_ids": location_ids}

    async def list_with_related(self, user_id: int, skip: int = 0, limit: int = 100) -> list[BrandListResponse]:
        """List brands with related summaries."""
        brands = (
            await self.session.execute(
                select(Brand)
                .where(Brand.user_id == user_id)
                .offset(skip)
                .limit(limit)
            )
        ).scalars().all()
        brand_ids = [brand.id for brand in brands]
        maps = await self._related_maps(brand_ids)

        return [
            BrandListResponse(
                id=brand.id,
                name=brand.name,
                description=brand.description,
                notes=brand.notes,
                created_at=brand.created_at,
                updated_at=brand.updated_at,
                members=maps["members"].get(brand.id, []),
                location_ids=maps["location_ids"].get(brand.id, []),
            )
            for brand in brands
        ]

    async def get_detail(self, brand_id: int, user_id: int) -> BrandDetailResponse:
        """Get brand detail with related summaries."""
        brand = await self.get(brand_id, user_id)
        maps = await self._related_maps([brand.id])
        return BrandDetailResponse(
            id=brand.id,
            name=brand.name,
            description=brand.description,
            notes=brand.notes,
            created_at=brand.created_at,
            updated_at=brand.updated_at,
            members=maps["members"].get(brand.id, []),
            location_ids=maps["location_ids"].get(brand.id, []),
        )
