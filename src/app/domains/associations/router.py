"""Associations domain - API routes for managing associations."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.associations.schemas import (
    CircleMemberRequest,
    CircleMemberResponse,
    CircleEventRequest,
    CircleEventResponse,
    EventParticipantRequest,
    EventParticipantResponse,
    BulkEventParticipantRequest,
    BrandAssociationRequest,
    BrandAssociationResponse,
)
from app.domains.associations.service import (
    CircleMemberService,
    CircleEventService,
    EventParticipantService,
    BrandAssociationService,
)
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser

router = APIRouter()


# ===== Circle Membership =====


@router.post("/circle-members", response_model=CircleMemberResponse)
async def add_member_to_circle(
    request: CircleMemberRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CircleMemberResponse:
    """Add a person to a social circle."""
    service = CircleMemberService(db)
    member = await service.add_member_to_circle(
        request.social_circle_id, request.person_id, current_user.id
    )
    await db.commit()
    return member


@router.delete("/circle-members/{social_circle_id}/{person_id}")
async def remove_member_from_circle(
    social_circle_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a person from a social circle."""
    service = CircleMemberService(db)
    await service.remove_member_from_circle(social_circle_id, person_id, current_user.id)
    await db.commit()
    return {"message": "Person removed from circle successfully"}


# ===== Event Participants =====


@router.post("/event-participants", response_model=EventParticipantResponse)
async def add_participant_to_event(
    request: EventParticipantRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EventParticipantResponse:
    """Add a person as a participant to an event."""
    service = EventParticipantService(db)
    participant = await service.add_participant_to_event(
        request.event_id, request.person_id, current_user.id, request.role
    )
    await db.commit()
    return participant


@router.delete("/event-participants/{event_id}/{person_id}")
async def remove_participant_from_event(
    event_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a person from an event."""
    service = EventParticipantService(db)
    await service.remove_participant_from_event(event_id, person_id, current_user.id)
    await db.commit()
    return {"message": "Person removed from event successfully"}


@router.put("/event-participants/{event_id}/{person_id}/role")
async def update_event_participant_role(
    event_id: int,
    person_id: int,
    role: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EventParticipantResponse:
    """Update a participant's role in an event."""
    service = EventParticipantService(db)
    participant = await service.update_participant_role(
        event_id, person_id, current_user.id, role
    )
    await db.commit()
    return participant


@router.post("/event-participants/bulk", response_model=list[EventParticipantResponse])
async def add_participants_bulk_to_event(
    request: BulkEventParticipantRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[EventParticipantResponse]:
    """Add multiple people as participants to an event."""
    service = EventParticipantService(db)
    participants = await service.add_participants_to_event(
        request.event_id, request.person_ids, current_user.id, request.role
    )
    await db.commit()
    return participants


# ===== Brand Associations =====


@router.post("/brand-members", response_model=BrandAssociationResponse)
async def add_member_to_brand(
    request: BrandAssociationRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BrandAssociationResponse:
    """Add a person to a brand."""
    service = BrandAssociationService(db)
    association = await service.add_member_to_brand(
        request.brand_id, request.person_id, current_user.id, request.type
    )
    await db.commit()
    return association


@router.delete("/brand-members/{brand_id}/{person_id}")
async def remove_member_from_brand(
    brand_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a person from a brand."""
    service = BrandAssociationService(db)
    await service.remove_member_from_brand(brand_id, person_id, current_user.id)
    await db.commit()
    return {"message": "Person removed from brand successfully"}


@router.put("/brand-members/{brand_id}/{person_id}/type")
async def update_brand_member_type(
    brand_id: int,
    person_id: int,
    type: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BrandAssociationResponse:
    """Update a member's type in a brand."""
    service = BrandAssociationService(db)
    association = await service.update_member_type(
        brand_id, person_id, current_user.id, type
    )
    await db.commit()
    return association


# ===== Circle Events =====


@router.post("/circle-events", response_model=CircleEventResponse)
async def associate_event_to_circle(
    request: CircleEventRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CircleEventResponse:
    """Associate an event with a social circle."""
    service = CircleEventService(db)
    association = await service.associate_event_to_circle(
        request.social_circle_id, request.event_id, current_user.id
    )
    await db.commit()
    return CircleEventResponse(
        social_circle_id=association.circle_id,
        event_id=association.event_id,
    )


@router.delete("/circle-events/{social_circle_id}/{event_id}")
async def remove_event_from_circle(
    social_circle_id: int,
    event_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove an event from a social circle."""
    service = CircleEventService(db)
    await service.remove_event_from_circle(social_circle_id, event_id, current_user.id)
    await db.commit()
    return {"message": "Event removed from circle successfully"}



