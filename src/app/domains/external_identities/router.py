"""External identities domain - API routes."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.external_identities.repository import ExternalIdentityRepository
from app.domains.external_identities.schemas import (
    ExternalIdentityAssociationCreateRequest,
    ExternalIdentityAssociationResponse,
    ExternalIdentityCreateRequest,
    ExternalIdentityDetailResponse,
    ImmichPersonFaceLinkCandidateResponse,
    ExternalIdentityResponse,
    ExternalIdentityUpdateRequest,
)
from app.domains.external_identities.service import ExternalIdentityService
from app.domains.immich.service import ImmichService
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


@router.post("", response_model=ExternalIdentityResponse)
async def create_external_identity(
    request: ExternalIdentityCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ExternalIdentityResponse:
    """Create an external identity."""
    service = ExternalIdentityService(db)
    identity = await service.create(current_user.id, request)
    await db.commit()
    return identity


@router.get("", response_model=list[ExternalIdentityResponse])
async def list_external_identities(
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[ExternalIdentityResponse]:
    """List external identities for current user."""
    repo = ExternalIdentityRepository(db)
    return await repo.list_by_user(current_user.id, skip, limit)


@router.get("/immich/person-faces", response_model=list[ImmichPersonFaceLinkCandidateResponse])
async def list_immich_person_faces_for_linking(
    current_user: CurrentUser,
    person_id: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[ImmichPersonFaceLinkCandidateResponse]:
    """List minimal Immich face identities used by person-linking UI, with optional link to one person."""
    service = ExternalIdentityService(db)
    payload = await service.list_immich_person_faces_for_linking(current_user.id, person_id)
    return [
        ImmichPersonFaceLinkCandidateResponse(**entry)
        for entry in payload
    ]


@router.get("/{external_identity_id}", response_model=ExternalIdentityDetailResponse)
async def get_external_identity(
    external_identity_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ExternalIdentityDetailResponse:
    """Get external identity detail including associations."""
    service = ExternalIdentityService(db)
    identity = await service.get(external_identity_id, current_user.id)
    associations = await service.list_associations(external_identity_id, current_user.id)
    base_payload = ExternalIdentityResponse.model_validate(identity).model_dump()
    return ExternalIdentityDetailResponse(
        **base_payload,
        associations=[
            ExternalIdentityAssociationResponse.model_validate(entry)
            for entry in associations
        ],
    )


@router.put("/{external_identity_id}", response_model=ExternalIdentityResponse)
async def update_external_identity(
    external_identity_id: int,
    request: ExternalIdentityUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ExternalIdentityResponse:
    """Update an external identity."""
    service = ExternalIdentityService(db)
    identity = await service.update(external_identity_id, current_user.id, request)
    await db.commit()
    return identity


@router.delete("/{external_identity_id}")
async def delete_external_identity(
    external_identity_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete an external identity."""
    service = ExternalIdentityService(db)
    await service.delete(external_identity_id, current_user.id)
    await db.commit()
    return {"message": "External identity deleted successfully"}


@router.post(
    "/{external_identity_id}/associations",
    response_model=ExternalIdentityAssociationResponse,
)
async def add_external_identity_association(
    external_identity_id: int,
    request: ExternalIdentityAssociationCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ExternalIdentityAssociationResponse:
    """Associate external identity with an internal entity."""
    service = ExternalIdentityService(db)
    association = await service.add_association(external_identity_id, current_user.id, request)
    await db.commit()
    return association


@router.delete("/{external_identity_id}/associations/{association_id}")
async def remove_external_identity_association(
    external_identity_id: int,
    association_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove an association from an external identity."""
    service = ExternalIdentityService(db)
    await service.remove_association(external_identity_id, association_id, current_user.id)
    await db.commit()
    return {"message": "Association removed successfully"}


@router.get("/{external_identity_id}/image")
async def get_external_identity_image(
    external_identity_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Proxy an external identity image through PEM using the stored record and Immich fallback lookup."""
    immich_service = ImmichService(db)
    content, media_type = await immich_service.get_external_identity_image(current_user.id, external_identity_id)
    return Response(content=content, media_type=media_type)
