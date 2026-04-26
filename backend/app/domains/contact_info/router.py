"""Contact Info domain - API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.contact_info.schemas import (
    ContactInfoCreateRequest,
    ContactInfoResponse,
    ContactInfoUpdateRequest,
)
from app.domains.contact_info.service import ContactInfoService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=ContactInfoResponse)
async def create_contact_info(
    request: ContactInfoCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ContactInfoResponse:
    """Create contact info for a person."""
    service = ContactInfoService(db)
    contact_info = await service.create(request, current_user.id)
    await db.commit()
    return contact_info


@router.get("/{contact_id}", response_model=ContactInfoResponse)
async def get_contact_info(
    contact_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ContactInfoResponse:
    """Get contact info by ID."""
    service = ContactInfoService(db)
    return await service.get(contact_id, current_user.id)


@router.put("/{contact_id}", response_model=ContactInfoResponse)
async def update_contact_info(
    contact_id: int,
    request: ContactInfoUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ContactInfoResponse:
    """Update contact info."""
    service = ContactInfoService(db)
    contact_info = await service.update(contact_id, current_user.id, request)
    await db.commit()
    return contact_info


@router.delete("/{contact_id}")
async def delete_contact_info(
    contact_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete contact info."""
    service = ContactInfoService(db)
    await service.delete(contact_id, current_user.id)
    await db.commit()
    return {"message": "Contact info deleted successfully"}
