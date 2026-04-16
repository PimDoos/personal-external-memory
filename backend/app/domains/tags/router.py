"""Tags domain - API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.tags.schemas import (
    PersonTagAssociationRequest,
    PersonTagResponse,
    TagCreateRequest,
    TagResponse,
    TagUpdateRequest,
)
from app.domains.tags.service import TagService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=TagResponse)
async def create_tag(
    request: TagCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    """Create a new tag."""
    service = TagService(db)
    tag = await service.create(current_user.id, request)
    await db.commit()
    return tag


@router.get("", response_model=list[TagResponse])
async def list_tags(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    """List all tags for current user."""
    service = TagService(db)
    from app.domains.tags.repository import TagRepository
    repo = TagRepository(db)
    return await repo.list_by_user(current_user.id, skip, limit)


@router.get("/people/{person_id}", response_model=list[TagResponse])
async def list_tags_for_person(
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    """List all tags for a person."""
    from app.domains.tags.repository import PersonTagRepository
    from sqlalchemy import select
    from app.infrastructure.models import Person

    stmt = select(Person).where(
        (Person.id == person_id) & (Person.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        from app.infrastructure.exceptions import NotFoundError
        raise NotFoundError("Person not found")

    repo = PersonTagRepository(db)
    return await repo.list_tags_for_person(person_id)


@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    """Get a tag by ID."""
    service = TagService(db)
    return await service.get(tag_id, current_user.id)


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    request: TagUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    """Update a tag."""
    service = TagService(db)
    tag = await service.update(tag_id, current_user.id, request)
    await db.commit()
    return tag


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a tag."""
    service = TagService(db)
    await service.delete(tag_id, current_user.id)
    await db.commit()
    return {"message": "Tag deleted successfully"}


# ===== Person-Tag Associations =====


@router.post("/{tag_id}/people/{person_id}", response_model=PersonTagResponse)
async def add_tag_to_person(
    tag_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PersonTagResponse:
    """Add a tag to a person."""
    service = TagService(db)
    await service.add_tag_to_person(person_id, tag_id, current_user.id)
    await db.commit()
    return {"person_id": person_id, "tag_id": tag_id}


@router.delete("/{tag_id}/people/{person_id}")
async def remove_tag_from_person(
    tag_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a tag from a person."""
    service = TagService(db)
    await service.remove_tag_from_person(person_id, tag_id, current_user.id)
    await db.commit()
    return {"message": "Tag removed from person successfully"}


@router.get("/{tag_id}/people", response_model=list[int])
async def list_people_with_tag(
    tag_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[int]:
    """List all people with a specific tag."""
    from app.domains.tags.repository import PersonTagRepository

    # Verify tag ownership
    service = TagService(db)
    await service.get(tag_id, current_user.id)

    repo = PersonTagRepository(db)
    return await repo.list_people_with_tag(tag_id)


