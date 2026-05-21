"""Social circles domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.social_circles.schemas import (
    SocialCircleCreateRequest,
    SocialCircleDetailResponse,
    SocialCircleListResponse,
    SocialCircleResponse,
    SocialCircleUpdateRequest,
)
from app.domains.social_circles.service import SocialCircleService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=SocialCircleResponse)
async def create_social_circle(
    request: SocialCircleCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> SocialCircleResponse:
    """Create a new social circle."""
    service = SocialCircleService(db)
    circle = await service.create(current_user.id, request)
    await db.commit()
    return circle


@router.get("/{circle_id}", response_model=SocialCircleDetailResponse)
async def get_social_circle(
    circle_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> SocialCircleDetailResponse:
    """Get a social circle by ID."""
    service = SocialCircleService(db)
    return await service.get_detail(circle_id, current_user.id)


@router.get("", response_model=list[SocialCircleListResponse])
async def list_social_circles(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[SocialCircleListResponse]:
    """List all social circles for current user."""
    service = SocialCircleService(db)
    return await service.list_with_related(current_user.id, skip, limit)


@router.put("/{circle_id}", response_model=SocialCircleResponse)
async def update_social_circle(
    circle_id: int,
    request: SocialCircleUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> SocialCircleResponse:
    """Update a social circle."""
    service = SocialCircleService(db)
    circle = await service.update(circle_id, current_user.id, request)
    await db.commit()
    return circle


@router.delete("/{circle_id}")
async def delete_social_circle(
    circle_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a social circle."""
    service = SocialCircleService(db)
    await service.delete(circle_id, current_user.id)
    await db.commit()
    return {"message": "Social circle deleted successfully"}
