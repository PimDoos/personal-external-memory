"""Associations domain - API routes for managing associations."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.domains.associations.schemas import (
    CircleMemberRequest,
    CircleMemberResponse,
    EventParticipantRequest,
    EventParticipantResponse,
    InteractionParticipantRequest,
    InteractionParticipantResponse,
    BrandAssociationRequest,
    BrandAssociationResponse,
)
from app.domains.associations.service import (
    CircleMemberService,
    EventParticipantService,
    InteractionParticipantService,
    BrandAssociationService,
)
from app.infrastructure.database import get_db
from app.infrastructure.dependencies import CurrentUser
from app.infrastructure.models import SocialCircle, Event, Interaction, Brand, CircleMember, EventParticipant, InteractionParticipant, BrandAssociation, Person
from app.infrastructure.exceptions import NotFoundError

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


@router.get("/circle-members/{social_circle_id}", response_model=list[int])
async def list_circle_members(
    social_circle_id: int,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[int]:
    """List all person IDs in a social circle."""
    # Verify circle ownership
    stmt = select(SocialCircle).where(
        (SocialCircle.id == social_circle_id) & (SocialCircle.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise NotFoundError("Social circle not found")

    # Get all members
    stmt = (
        select(Person.id)
        .join(CircleMember, CircleMember.person_id == Person.id)
        .where(CircleMember.social_circle_id == social_circle_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


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


@router.get("/event-participants/{event_id}", response_model=list[EventParticipantResponse])
async def list_event_participants(
    event_id: int,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[EventParticipantResponse]:
    """List all participants for an event."""
    # Verify event ownership
    stmt = select(Event).where(
        (Event.id == event_id) & (Event.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise NotFoundError("Event not found")

    # Get all participants
    stmt = (
        select(EventParticipant)
        .where(EventParticipant.event_id == event_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ===== Interaction Participants =====


@router.post("/interaction-participants", response_model=InteractionParticipantResponse)
async def add_participant_to_interaction(
    request: InteractionParticipantRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> InteractionParticipantResponse:
    """Add a person as a participant to an interaction."""
    service = InteractionParticipantService(db)
    participant = await service.add_participant_to_interaction(
        request.interaction_id, request.person_id, current_user.id
    )
    await db.commit()
    return participant


@router.delete("/interaction-participants/{interaction_id}/{person_id}")
async def remove_participant_from_interaction(
    interaction_id: int,
    person_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a person from an interaction."""
    service = InteractionParticipantService(db)
    await service.remove_participant_from_interaction(
        interaction_id, person_id, current_user.id
    )
    await db.commit()
    return {"message": "Person removed from interaction successfully"}


@router.get("/interaction-participants/{interaction_id}", response_model=list[int])
async def list_interaction_participants(
    interaction_id: int,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[int]:
    """List all person IDs in an interaction."""
    # Verify interaction ownership
    stmt = select(Interaction).where(
        (Interaction.id == interaction_id) & (Interaction.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise NotFoundError("Interaction not found")

    # Get all participants
    stmt = (
        select(Person.id)
        .join(InteractionParticipant, InteractionParticipant.person_id == Person.id)
        .where(InteractionParticipant.interaction_id == interaction_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


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


@router.get("/brand-members/{brand_id}", response_model=list[BrandAssociationResponse])
async def list_brand_members(
    brand_id: int,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[BrandAssociationResponse]:
    """List all members associated with a brand."""
    # Verify brand ownership
    stmt = select(Brand).where(
        (Brand.id == brand_id) & (Brand.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise NotFoundError("Brand not found")

    # Get all members
    stmt = (
        select(BrandAssociation)
        .where(BrandAssociation.brand_id == brand_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
