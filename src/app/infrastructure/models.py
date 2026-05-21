"""Database models for all domains."""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.infrastructure.database import Base


# ===== User (Authentication) =====
class User(Base):
    """User account for authentication and data isolation."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    openid_issuer = Column(String(512), nullable=True, index=True)
    openid_subject = Column(String(255), nullable=True, index=True)
    openid_email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    people = relationship("Person", back_populates="user", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    social_circles = relationship(
        "SocialCircle", back_populates="user", cascade="all, delete-orphan"
    )
    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")
    locations = relationship("Location", back_populates="user", cascade="all, delete-orphan")
    external_identities = relationship(
        "ExternalIdentity", back_populates="user", cascade="all, delete-orphan"
    )
    settings = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


# ===== User Settings =====
class UserSettings(Base):
    """User-level preferences and integration keys."""

    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    me_person_id = Column(Integer, nullable=True, index=True)
    immich_api_key = Column(String(512), nullable=True)
    immich_base_url = Column(String(512), nullable=True)
    home_assistant_api_key = Column(String(512), nullable=True)
    home_assistant_base_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", back_populates="settings")


# ===== Person =====
class Person(Base):
    """Individual person record."""

    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=True)
    birth_date = Column(Date, nullable=True)
    date_of_death = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="people")
    contact_infos = relationship(
        "ContactInfo", back_populates="person", cascade="all, delete-orphan"
    )
    tags = relationship(
        "Tag", secondary="person_tags", back_populates="people"
    )
    social_circles = relationship(
        "SocialCircle", secondary="circle_members", back_populates="members"
    )
    events = relationship(
        "Event", secondary="event_participants", back_populates="people"
    )
    brands = relationship(
        "Brand", secondary="brand_associations", back_populates="members"
    )


# ===== Tag =====
class Tag(Base):
    """Customizable tag for categorizing people."""

    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(7), nullable=True)  # Hex color code

    # Relationships
    user = relationship("User", back_populates="tags")
    people = relationship(
        "Person", secondary="person_tags", back_populates="tags"
    )


# ===== PersonTag (association) =====
class PersonTag(Base):
    """Association between Person and Tag."""

    __tablename__ = "person_tags"

    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id"), primary_key=True)


# ===== ContactInfo =====

# ===== PersonRelationship =====
class PersonRelationship(Base):
    """Relationship between two people (family, friends, colleagues, etc.)."""

    __tablename__ = "person_relationships"

    id = Column(Integer, primary_key=True, index=True)
    person_id_1 = Column(Integer, ForeignKey("people.id"), nullable=False, index=True)
    person_id_2 = Column(Integer, ForeignKey("people.id"), nullable=False, index=True)
    relationship_type = Column(String(100), nullable=False)  # DEPRECATED: will be removed after migration
    relationship_type_id = Column(Integer, ForeignKey("managed_types.id", ondelete="SET NULL"), nullable=True)
    type_entry = relationship("ManagedType", foreign_keys=[relationship_type_id])
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class ContactInfo(Base):
    """Contact information for a person (phone, address, social media, etc.)."""

    __tablename__ = "contact_infos"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False, index=True)
    contact_type = Column(String(50), nullable=False)  # phone, email, address, social_media
    value = Column(String(500), nullable=False)

    # Relationships
    person = relationship("Person", back_populates="contact_infos")


# ===== ManagedType =====
class ManagedType(Base):
    """User-managed type list entries for configurable taxonomies."""

    __tablename__ = "managed_types"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    uri_handler = Column(String(255), nullable=True)
    left_label = Column(String(255), nullable=True)
    right_label = Column(String(255), nullable=True)
    emoji = Column(String(32), nullable=True)


# ===== SocialCircle =====
class SocialCircle(Base):
    """Collection of people (family, friends, work team, etc.)."""

    __tablename__ = "social_circles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    circle_type = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="social_circles")
    members = relationship(
        "Person", secondary="circle_members", back_populates="social_circles"
    )
    event_associations = relationship(
        "SocialCircleAssociation",
        back_populates="circle",
        cascade="all, delete-orphan",
        foreign_keys="SocialCircleAssociation.circle_id",
    )


# ===== CircleMember (association) =====
class CircleMember(Base):
    """Association between SocialCircle and Person."""

    __tablename__ = "circle_members"

    social_circle_id = Column(Integer, ForeignKey("social_circles.id"), primary_key=True)
    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)


# ===== Brand =====
class Brand(Base):
    """Business or other non-person entity."""

    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="brands")
    contact_infos = relationship(
        "BrandContact", back_populates="brand", cascade="all, delete-orphan"
    )
    members = relationship(
        "Person", secondary="brand_associations", back_populates="brands"
    )


# ===== BrandAssociation (association) =====
class BrandAssociation(Base):
    """Association between Brand and Person."""

    __tablename__ = "brand_associations"

    brand_id = Column(Integer, ForeignKey("brands.id"), primary_key=True)
    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)
    type = Column(String(100), nullable=True)  # employee, owner, customer, etc.


# ===== BrandContact =====
class BrandContact(Base):
    """Contact information for a brand."""

    __tablename__ = "brand_contacts"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False, index=True)
    contact_type = Column(String(50), nullable=False)  # phone, email, address, etc.
    value = Column(String(500), nullable=False)

    # Relationships
    brand = relationship("Brand", back_populates="contact_infos")

# ===== Event =====
class Event(Base):
    """Special occasion (birthday, anniversary, etc.)."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    event_type = Column(String(100), nullable=True)
    date = Column(DateTime, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="events")
    people = relationship(
        "Person", secondary="event_participants", back_populates="events"
    )


# ===== EventParticipant (association) =====
class EventParticipant(Base):
    """Association between Event and Person with role."""

    __tablename__ = "event_participants"

    event_id = Column(Integer, ForeignKey("events.id"), primary_key=True)
    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)
    role = Column(String(100), nullable=True)  # host, guest, organizer, etc.


# ===== Location =====
class Location(Base):
    """Location entity that can be associated with people, brands, circles, or events."""

    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    location_type = Column(String(100), nullable=True)  # Home, Office, Other, etc.
    label = Column(String(255), nullable=True)
    location = Column(String(500), nullable=False)  # Address or coordinates
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geocode_status = Column(String(32), nullable=True)
    geocoded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="locations")


# ===== SocialCircleAssociation (association) =====
class SocialCircleAssociation(Base):
    """Association between SocialCircle and Event."""

    __tablename__ = "social_circle_associations"

    id = Column(Integer, primary_key=True, index=True)
    circle_id = Column(Integer, ForeignKey("social_circles.id"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)

    # Relationships
    circle = relationship(
        "SocialCircle",
        back_populates="event_associations",
        foreign_keys=[circle_id],
    )
    event = relationship("Event", foreign_keys=[event_id])


# ===== LocationAssociation (association) =====
class LocationAssociation(Base):
    """Association between Location and any entity (person, brand, social_circle, event)."""

    __tablename__ = "location_associations"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)  # person, brand, social_circle, event
    entity_id = Column(Integer, nullable=False, index=True)


# ===== ExternalIdentity =====
class ExternalIdentity(Base):
    """Identity/entity provided by an external integration."""

    __tablename__ = "external_identities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    external_id = Column(String(255), nullable=False)
    source = Column(String(255), nullable=False)
    entity_type = Column(String(50), nullable=False)  # person, location, event, image, text
    click_uri = Column(String(2000), nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    image_url = Column(String(2000), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    content = Column(Text, nullable=True)
    is_read_only = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "source", "external_id", name="uq_external_identity_key"),
    )

    user = relationship("User", back_populates="external_identities")
    associations = relationship(
        "ExternalIdentityAssociation",
        back_populates="external_identity",
        cascade="all, delete-orphan",
    )


# ===== ExternalIdentityAssociation =====
class ExternalIdentityAssociation(Base):
    """Association between external identity and an internal entity."""

    __tablename__ = "external_identity_associations"

    id = Column(Integer, primary_key=True, index=True)
    external_identity_id = Column(
        Integer,
        ForeignKey("external_identities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type = Column(String(50), nullable=False)  # person, social_circle, brand, event
    entity_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "external_identity_id",
            "entity_type",
            "entity_id",
            name="uq_external_identity_association",
        ),
    )

    external_identity = relationship("ExternalIdentity", back_populates="associations")


# ===== Resource =====
class Resource(Base):
    """Link or file associated with any entity."""

    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(50), nullable=False)  # person, event, brand, social_circle, etc.
    entity_id = Column(Integer, nullable=False)
    resource_type = Column(String(50), nullable=False)  # link or file
    url = Column(String(2000), nullable=True)  # For links
    file_path = Column(String(500), nullable=True)  # For uploaded files
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
