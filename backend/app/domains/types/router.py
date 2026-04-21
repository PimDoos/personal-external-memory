"""Managed type list API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.types.schemas import (
    ManagedTypeCreateRequest,
    ManagedTypeResponse,
    ManagedTypeUpdateRequest,
)
from app.domains.types.service import ManagedTypeService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.get("/{category}", response_model=list[ManagedTypeResponse])
async def list_types(
    category: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[ManagedTypeResponse]:
    """List managed type entries for a category."""
    service = ManagedTypeService(db)
    return await service.list_for_category(current_user.id, category)


@router.post("/{category}", response_model=ManagedTypeResponse)
async def create_type(
    category: str,
    request: ManagedTypeCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ManagedTypeResponse:
    """Create a managed type entry for a category."""
    service = ManagedTypeService(db)
    entry = await service.create(current_user.id, category, request)
    await db.commit()
    return entry


@router.put("/{category}/{type_id}", response_model=ManagedTypeResponse)
async def update_type(
    category: str,
    type_id: int,
    request: ManagedTypeUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ManagedTypeResponse:
    """Update a managed type entry."""
    service = ManagedTypeService(db)
    entry = await service.update(current_user.id, category, type_id, request)
    await db.commit()
    return entry


@router.delete("/{category}/{type_id}")
async def delete_type(
    category: str,
    type_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a managed type entry."""
    service = ManagedTypeService(db)
    await service.delete(current_user.id, category, type_id)
    await db.commit()
    return {"message": "Type entry deleted"}
