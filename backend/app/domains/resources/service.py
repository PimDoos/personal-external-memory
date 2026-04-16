"""Resources domain - business logic."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.resources.schemas import ResourceCreateRequest
from app.infrastructure.models import Resource
from app.infrastructure.exceptions import NotFoundError


class ResourceService:
    """Service for managing resources."""

    def __init__(self, session: AsyncSession):
        """Initialize resource service."""
        self.session = session

    async def create(self, data: ResourceCreateRequest) -> Resource:
        """Create a new resource."""
        resource = Resource(
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            resource_type=data.resource_type,
            url=data.url,
            file_path=data.file_path,
        )
        self.session.add(resource)
        await self.session.flush()
        return resource

    async def get(self, resource_id: int) -> Resource:
        """Get a resource by ID."""
        stmt = select(Resource).where(Resource.id == resource_id)
        result = await self.session.execute(stmt)
        resource = result.scalar_one_or_none()

        if not resource:
            raise NotFoundError("Resource not found")

        return resource

    async def delete(self, resource_id: int) -> None:
        """Delete a resource."""
        resource = await self.get(resource_id)
        await self.session.delete(resource)
        await self.session.flush()
