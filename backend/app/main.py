"""FastAPI application factory and setup."""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.infrastructure.database import close_db, init_db
from app.infrastructure.exceptions import (
    ConflictError,
    NotFoundError,
    PEMException,
    UnauthorizedError,
    ValidationError,
)


FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
FRONTEND_ASSETS_DIR = FRONTEND_DIR / "assets"


async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("Starting up Personal External Memory Backend...")
    await init_db()
    yield
    # Shutdown
    await close_db()
    print("Shutting down...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.
    
    Returns:
        Configured FastAPI application instance
    """
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        description=settings.APP_DESCRIPTION,
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    # ===== CORS Middleware =====
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ===== Exception Handlers =====
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError):
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(PEMException)
    async def pem_exception_handler(request: Request, exc: PEMException):
        return JSONResponse(status_code=500, content={"detail": str(exc)})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors()},
        )

    # ===== Health Check =====
    @app.get("/api/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "version": settings.APP_VERSION}

    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="assets")

    @app.get("/")
    async def frontend_index():
        """Serve the frontend application."""
        return FileResponse(FRONTEND_DIR / "index.html")

    # ===== Router Includes =====
    from app.domains.auth.router import router as auth_router
    from app.domains.people.router import router as people_router
    from app.domains.social_circles.router import router as social_circles_router
    from app.domains.brands.router import router as brands_router
    from app.domains.interactions.router import router as interactions_router
    from app.domains.events.router import router as events_router
    from app.domains.resources.router import router as resources_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(people_router, prefix="/api/people", tags=["people"])
    app.include_router(
        social_circles_router, prefix="/api/social-circles", tags=["social_circles"]
    )
    app.include_router(brands_router, prefix="/api/brands", tags=["brands"])
    app.include_router(
        interactions_router, prefix="/api/interactions", tags=["interactions"]
    )
    app.include_router(events_router, prefix="/api/events", tags=["events"])
    from app.domains.contact_info.router import router as contact_info_router
    from app.domains.tags.router import router as tags_router
    from app.domains.relationships.router import router as relationships_router
    from app.domains.associations.router import router as associations_router

    app.include_router(resources_router, prefix="/api/resources", tags=["resources"])
    app.include_router(contact_info_router, prefix="/api/contact-info", tags=["contact_info"])
    app.include_router(tags_router, prefix="/api/tags", tags=["tags"])
    app.include_router(relationships_router, prefix="/api/relationships", tags=["relationships"])
    app.include_router(associations_router, prefix="/api/associations", tags=["associations"])

    return app


# Application instance
app = create_app()
