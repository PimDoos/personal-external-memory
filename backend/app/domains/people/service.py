"""People domain - business logic."""

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.people.schemas import PersonCreateRequest, PersonDetailResponse, PersonListResponse, PersonUpdateRequest
from app.infrastructure.models import (
    Brand,
    BrandAssociation,
    CircleMember,
    ContactInfo,
    Event,
    EventParticipant,
    Location,
    LocationAssociation,
    Person,
    PersonRelationship,
    PersonTag,
    SocialCircle,
    Tag,
)
from app.infrastructure.exceptions import NotFoundError


class PersonService:
    """Service for managing people."""

    def __init__(self, session: AsyncSession):
        """Initialize person service.
        
        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def create_person(
        self, user_id: int, data: PersonCreateRequest
    ) -> Person:
        """Create a new person.
        
        Args:
            user_id: User ID (owner)
            data: Person creation data
            
        Returns:
            Created person
        """
        person = Person(
            user_id=user_id,
            first_name=data.first_name,
            last_name=data.last_name,
            birth_date=data.birth_date,
            date_of_death=data.date_of_death,
            notes=data.notes,
        )
        self.session.add(person)
        await self.session.flush()
        await self.session.refresh(person)
        return person

    async def get_person(self, person_id: int, user_id: int) -> Person:
        """Get a person by ID.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            
        Returns:
            Person
            
        Raises:
            NotFoundError: If person not found
        """
        stmt = select(Person).where(
            (Person.id == person_id) & (Person.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        person = result.scalar_one_or_none()
        
        if not person:
            raise NotFoundError("Person not found")
        
        return person

    async def _build_related_maps(self, person_ids: list[int], user_id: int) -> dict[str, dict[int, list[Any]]]:
        """Load related data for people and return per-person maps."""
        if not person_ids:
            return {
                "tags": {},
                "contacts": {},
                "locations": {},
                "relationships": {},
                "circle_ids": {},
                "event_participations": {},
                "brand_memberships": {},
                "explicit_brand_ids": {},
            }

        tags_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        contacts_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        locations_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        relationships_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        circle_ids_map: dict[int, list[int]] = {person_id: [] for person_id in person_ids}
        event_participations_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        brand_memberships_map: dict[int, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        explicit_brand_ids_map: dict[int, list[int]] = {person_id: [] for person_id in person_ids}

        tag_stmt = (
            select(PersonTag.person_id, Tag.id, Tag.name, Tag.description, Tag.color)
            .join(Tag, Tag.id == PersonTag.tag_id)
            .where(PersonTag.person_id.in_(person_ids), Tag.user_id == user_id)
        )
        tag_rows = (await self.session.execute(tag_stmt)).all()
        for row in tag_rows:
            tags_map[row.person_id].append(
                {
                    "id": row.id,
                    "name": row.name,
                    "description": row.description,
                    "color": row.color,
                }
            )

        contacts_stmt = select(ContactInfo).where(ContactInfo.person_id.in_(person_ids))
        contact_rows = (await self.session.execute(contacts_stmt)).scalars().all()
        for contact in contact_rows:
            contacts_map[contact.person_id].append(
                {
                    "id": contact.id,
                    "person_id": contact.person_id,
                    "contact_type": contact.contact_type,
                    "value": contact.value,
                }
            )

        locations_stmt = (
            select(LocationAssociation.entity_id, Location)
            .join(Location, Location.id == LocationAssociation.location_id)
            .where(
                LocationAssociation.entity_type == "person",
                LocationAssociation.entity_id.in_(person_ids),
                Location.user_id == user_id,
            )
        )
        location_rows = (await self.session.execute(locations_stmt)).all()
        for entity_id, location in location_rows:
            locations_map[entity_id].append(
                {
                    "id": location.id,
                    "location_type": location.location_type,
                    "label": location.label,
                    "location": location.location,
                    "created_at": location.created_at,
                    "updated_at": location.updated_at,
                }
            )

        relationships_stmt = select(PersonRelationship).where(
            or_(
                PersonRelationship.person_id_1.in_(person_ids),
                PersonRelationship.person_id_2.in_(person_ids),
            )
        )
        relationship_rows = (await self.session.execute(relationships_stmt)).scalars().all()
        
        # Fetch ManagedType entries for relationships
        type_ids = {r.relationship_type_id for r in relationship_rows if r.relationship_type_id}
        type_map = {}
        if type_ids:
            from app.infrastructure.models import ManagedType
            stmt = select(ManagedType).where(ManagedType.id.in_(type_ids))
            result = await self.session.execute(stmt)
            for entry in result.scalars():
                type_map[entry.id] = entry
        
        for rel in relationship_rows:
            type_entry = None
            if rel.relationship_type_id and rel.relationship_type_id in type_map:
                type_entry_obj = type_map[rel.relationship_type_id]
                type_entry = {
                    "id": type_entry_obj.id,
                    "name": type_entry_obj.name,
                    "category": type_entry_obj.category,
                    "left_label": type_entry_obj.left_label,
                    "right_label": type_entry_obj.right_label,
                    "emoji": type_entry_obj.emoji,
                    "uri_handler": type_entry_obj.uri_handler,
                }
            
            rel_payload = {
                "id": rel.id,
                "person_id_1": rel.person_id_1,
                "person_id_2": rel.person_id_2,
                "relationship_type": rel.relationship_type,
                "relationship_type_id": rel.relationship_type_id,
                "notes": rel.notes,
                "type_entry": type_entry,
            }
            if rel.person_id_1 in relationships_map:
                relationships_map[rel.person_id_1].append(rel_payload)
            if rel.person_id_2 in relationships_map and rel.person_id_2 != rel.person_id_1:
                relationships_map[rel.person_id_2].append(rel_payload)

        circle_stmt = (
            select(CircleMember.person_id, CircleMember.social_circle_id)
            .join(SocialCircle, SocialCircle.id == CircleMember.social_circle_id)
            .where(CircleMember.person_id.in_(person_ids), SocialCircle.user_id == user_id)
        )
        circle_rows = (await self.session.execute(circle_stmt)).all()
        for person_id, circle_id in circle_rows:
            circle_ids_map[person_id].append(circle_id)

        participation_stmt = (
            select(EventParticipant.person_id, EventParticipant.event_id, EventParticipant.role)
            .join(Event, Event.id == EventParticipant.event_id)
            .where(EventParticipant.person_id.in_(person_ids), Event.user_id == user_id)
        )
        participation_rows = (await self.session.execute(participation_stmt)).all()
        for person_id, event_id, role in participation_rows:
            event_participations_map[person_id].append(
                {
                    "event_id": event_id,
                    "person_id": person_id,
                    "role": role,
                }
            )

        brand_stmt = (
            select(BrandAssociation.person_id, BrandAssociation.brand_id, BrandAssociation.type)
            .join(Brand, Brand.id == BrandAssociation.brand_id)
            .where(BrandAssociation.person_id.in_(person_ids), Brand.user_id == user_id)
        )
        brand_rows = (await self.session.execute(brand_stmt)).all()
        for person_id, brand_id, member_type in brand_rows:
            brand_memberships_map[person_id].append(
                {
                    "brand_id": brand_id,
                    "person_id": person_id,
                    "type": member_type,
                }
            )
            explicit_brand_ids_map[person_id].append(brand_id)

        return {
            "tags": tags_map,
            "contacts": contacts_map,
            "locations": locations_map,
            "relationships": relationships_map,
            "circle_ids": circle_ids_map,
            "event_participations": event_participations_map,
            "brand_memberships": brand_memberships_map,
            "explicit_brand_ids": explicit_brand_ids_map,
        }

    async def list_people_with_related(
        self, user_id: int, skip: int = 0, limit: int = 100
    ) -> list[PersonListResponse]:
        """List people with related summary payloads for list rendering."""
        stmt = (
            select(Person)
            .where(Person.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        people = (await self.session.execute(stmt)).scalars().all()
        person_ids = [person.id for person in people]
        related_maps = await self._build_related_maps(person_ids, user_id)

        payload: list[PersonListResponse] = []
        for person in people:
            payload.append(
                PersonListResponse(
                    id=person.id,
                    first_name=person.first_name,
                    last_name=person.last_name,
                    birth_date=person.birth_date,
                    date_of_death=person.date_of_death,
                    notes=person.notes,
                    created_at=person.created_at,
                    updated_at=person.updated_at,
                    tags=related_maps["tags"].get(person.id, []),
                    circle_ids=related_maps["circle_ids"].get(person.id, []),
                    event_ids=[entry["event_id"] for entry in related_maps["event_participations"].get(person.id, [])],
                    explicit_brand_ids=related_maps["explicit_brand_ids"].get(person.id, []),
                )
            )
        return payload

    async def get_person_detail(self, person_id: int, user_id: int) -> PersonDetailResponse:
        """Get person detail with all related data for detail rendering."""
        person = await self.get_person(person_id, user_id)
        related_maps = await self._build_related_maps([person.id], user_id)

        event_participations = related_maps["event_participations"].get(person.id, [])
        return PersonDetailResponse(
            id=person.id,
            first_name=person.first_name,
            last_name=person.last_name,
            birth_date=person.birth_date,
            date_of_death=person.date_of_death,
            notes=person.notes,
            created_at=person.created_at,
            updated_at=person.updated_at,
            tags=related_maps["tags"].get(person.id, []),
            circle_ids=related_maps["circle_ids"].get(person.id, []),
            event_ids=[entry["event_id"] for entry in event_participations],
            explicit_brand_ids=related_maps["explicit_brand_ids"].get(person.id, []),
            contact_infos=related_maps["contacts"].get(person.id, []),
            locations=related_maps["locations"].get(person.id, []),
            relationships=related_maps["relationships"].get(person.id, []),
            brand_memberships=related_maps["brand_memberships"].get(person.id, []),
            event_participations=event_participations,
        )

    async def update_person(
        self, person_id: int, user_id: int, data: PersonUpdateRequest
    ) -> Person:
        """Update a person.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            data: Update data
            
        Returns:
            Updated person
            
        Raises:
            NotFoundError: If person not found
        """
        person = await self.get_person(person_id, user_id)
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(person, key, value)
        
        await self.session.flush()
        await self.session.refresh(person)
        return person

    async def delete_person(self, person_id: int, user_id: int) -> None:
        """Delete a person.
        
        Args:
            person_id: Person ID
            user_id: User ID (for authorization)
            
        Raises:
            NotFoundError: If person not found
        """
        person = await self.get_person(person_id, user_id)
        await self.session.delete(person)
        await self.session.flush()
