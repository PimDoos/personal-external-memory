"""Brands domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.brands.schemas import (
    BrandCreateRequest,
    BrandDetailResponse,
    BrandListResponse,
    BrandResponse,
    BrandUpdateRequest,
)
from app.domains.brands.service import BrandService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=BrandResponse)
async def create_brand(
    request: BrandCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    """Create a new brand."""
    service = BrandService(db)
    brand = await service.create(current_user.id, request)
    await db.commit()
    return brand


@router.get("/{brand_id}", response_model=BrandDetailResponse)
async def get_brand(
    brand_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BrandDetailResponse:
    """Get a brand by ID."""
    service = BrandService(db)
    return await service.get_detail(brand_id, current_user.id)


@router.get("", response_model=list[BrandListResponse])
async def list_brands(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[BrandListResponse]:
    """List all brands for current user."""
    service = BrandService(db)
    return await service.list_with_related(current_user.id, skip, limit)


@router.put("/{brand_id}", response_model=BrandResponse)
async def update_brand(
    brand_id: int,
    request: BrandUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    """Update a brand."""
    service = BrandService(db)
    brand = await service.update(brand_id, current_user.id, request)
    await db.commit()
    return brand


@router.delete("/{brand_id}")
async def delete_brand(
    brand_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a brand."""
    service = BrandService(db)
    await service.delete(brand_id, current_user.id)
    await db.commit()
    return {"message": "Brand deleted successfully"}
