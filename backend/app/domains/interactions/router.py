"""Interactions domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.interactions.schemas import (
    InteractionCreateRequest,
    InteractionResponse,
    InteractionUpdateRequest,
)
from app.domains.interactions.service import InteractionService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=InteractionResponse)
async def create_interaction(
    request: InteractionCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> InteractionResponse:
    """Create a new interaction."""
    service = InteractionService(db)
    interaction = await service.create(current_user.id, request)
    await db.commit()
    return interaction


@router.get("/{interaction_id}", response_model=InteractionResponse)
async def get_interaction(
    interaction_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> InteractionResponse:
    """Get an interaction by ID."""
    service = InteractionService(db)
    return await service.get(interaction_id, current_user.id)


@router.get("", response_model=list[InteractionResponse])
async def list_interactions(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[InteractionResponse]:
    """List all interactions for current user."""
    service = InteractionService(db)
    from app.domains.interactions.repository import InteractionRepository
    repo = InteractionRepository(db)
    return await repo.list_by_user(current_user.id, skip, limit)


@router.put("/{interaction_id}", response_model=InteractionResponse)
async def update_interaction(
    interaction_id: int,
    request: InteractionUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> InteractionResponse:
    """Update an interaction."""
    service = InteractionService(db)
    interaction = await service.update(interaction_id, current_user.id, request)
    await db.commit()
    return interaction


@router.delete("/{interaction_id}")
async def delete_interaction(
    interaction_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete an interaction."""
    service = InteractionService(db)
    await service.delete(interaction_id, current_user.id)
    await db.commit()
    return {"message": "Interaction deleted successfully"}
