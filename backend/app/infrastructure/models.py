"""Database models for all domains."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Boolean
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
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    people = relationship("Person", back_populates="user", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    social_circles = relationship(
        "SocialCircle", back_populates="user", cascade="all, delete-orphan"
    )
    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")
    interactions = relationship(
        "Interaction", back_populates="user", cascade="all, delete-orphan"
    )
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")


# ===== Person =====
class Person(Base):
    """Individual person record."""

    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=True)
    birth_date = Column(DateTime, nullable=True)
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
    interactions = relationship(
        "Interaction", secondary="interaction_participants", back_populates="people"
    )
    events = relationship(
        "Event", secondary="event_participants", back_populates="people"
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
    relationship_type = Column(String(100), nullable=False)  # family, friend, colleague, etc.
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


# ===== SocialCircle =====
class SocialCircle(Base):
    """Collection of people (family, friends, work team, etc.)."""

    __tablename__ = "social_circles"

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
    user = relationship("User", back_populates="social_circles")
    members = relationship(
        "Person", secondary="circle_members", back_populates="social_circles"
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


# ===== Interaction =====
class Interaction(Base):
    """Meeting, call, message, or other interaction."""

    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    medium = Column(String(100), nullable=True)  # Zoom, Phone call, Email, In-person, etc.
    location = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="interactions")
    people = relationship(
        "Person", secondary="interaction_participants", back_populates="interactions"
    )


# ===== InteractionParticipant (association) =====
class InteractionParticipant(Base):
    """Association between Interaction and Person."""

    __tablename__ = "interaction_participants"

    interaction_id = Column(Integer, ForeignKey("interactions.id"), primary_key=True)
    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)


# ===== Event =====
class Event(Base):
    """Special occasion (birthday, anniversary, etc.)."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    location = Column(String(255), nullable=True)
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


# ===== Resource =====
class Resource(Base):
    """Link or file associated with any entity."""

    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(50), nullable=False)  # person, event, interaction, etc.
    entity_id = Column(Integer, nullable=False)
    resource_type = Column(String(50), nullable=False)  # link or file
    url = Column(String(2000), nullable=True)  # For links
    file_path = Column(String(500), nullable=True)  # For uploaded files
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
