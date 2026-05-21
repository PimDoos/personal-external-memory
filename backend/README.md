# Personal External Memory - Backend

FastAPI-based REST API backend for the Personal External Memory (PEM) system.

## Quick Start

### Using Docker (Recommended for Development)

```bash
docker-compose up --build
```

The frontend will be available at `http://localhost:8000`, and the Swagger UI at `http://localhost:8000/api/docs`.

### Local Development Setup

#### 1. Install Python Dependencies

```bash
cd backend
pip install -e ".[dev]"
```

#### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` for your local development settings. Key variables:
- `DEBUG=True` for development
- `SECRET_KEY` — generate with `openssl rand -hex 32` for production
- `DATABASE_URL` — defaults to SQLite in current directory

#### 3. Initialize the Database

```bash
uvicorn app.main:app --reload
```

Database migrations run automatically on application startup via
`app.infrastructure.migrations.run_migrations()`.

#### 4. Run the Server

```bash
uvicorn app.main:app --reload
```

Visit `http://localhost:8000` for the frontend and `http://localhost:8000/api/docs` for the interactive API documentation.

## Project Structure

```
backend/
├── app/
│   ├── core/                 # Core configuration & security
│   │   ├── config.py        # Settings from environment
│   │   └── security.py      # JWT & password hashing
│   ├── domains/             # Business domain modules
│   │   ├── auth/            # Authentication (register, login)
│   │   ├── people/          # People management
│   │   ├── social_circles/  # Groups of people
│   │   ├── brands/          # Organizations/businesses
│   │   ├── events/          # Birthdays, anniversaries
│   │   └── resources/       # Links and files
│   ├── infrastructure/      # Database & shared utilities
│   │   ├── database.py      # SQLAlchemy setup
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── repository.py    # Base repository class
│   │   ├── exceptions.py    # Custom exceptions
│   │   └── dependencies.py  # DI for current user, etc.
│   ├── frontend/            # Native HTML/CSS/JS frontend
│   │   ├── index.html       # Application shell
│   │   └── assets/          # CSS and JavaScript modules
│   └── main.py              # FastAPI app factory
├── tests/                   # Test suite
│   ├── conftest.py         # Pytest fixtures
│   ├── test_auth.py        # Auth tests
│   └── ...
├── pyproject.toml          # Dependencies & project metadata
├── .env.example            # Example environment variables
└── README.md               # This file
```

## Architecture

### Domain-Driven Design

Each domain (people, events, brands, circles, etc.) is organized into:
- **Schemas** (`schemas.py`) — Pydantic models for validation
- **Service** (`service.py`) — Business logic
- **Repository** (`repository.py`) — Data access
- **Router** (`router.py`) — API endpoints

This structure keeps code organized and scales as features grow.

### Database

- **SQLAlchemy ORM** for type-safe database operations
- **Async SQLite** for single-server deployments
- **Startup migration runner** for schema migrations (`app/infrastructure/migrations.py`)
- Supports switching to PostgreSQL/MySQL by changing `DATABASE_URL`

### Authentication

JWT-based token authentication:
1. Register: `POST /api/auth/register` → receive access & refresh tokens
2. Login: `POST /api/auth/login` → receive tokens
3. Protected endpoints: Include `Authorization: Bearer <access_token>` header

Tokens expire after 30 minutes (configurable in `.env`).

### Frontend

- Native HTML, CSS, and JavaScript served directly by FastAPI
- Root URL `/` renders the PEM application shell
- Static assets are mounted at `/assets`
- The UI supports authentication, dashboard metrics, people, circles, brands, events, tags, contact info, relationships, and participant management

## API Documentation

Auto-generated Swagger UI available at `/api/docs` when server is running.

### Key Endpoints

#### Authentication
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login and get tokens

#### People Management
- `GET /api/people` — List all people
- `POST /api/people` — Create person
- `GET /api/people/{id}` — Get person details
- `PUT /api/people/{id}` — Update person
- `DELETE /api/people/{id}` — Delete person

#### Other Domains
Similar CRUD endpoints for:
- `/api/social-circles` — Social circles
- `/api/brands` — Organizations
- `/api/events` — Calendar events
- `/api/resources` — Links and files

#### Contact Information
- `POST /api/contact-info` — Add contact info to person (phone, email, address, social media)
- `GET /api/contact-info/{id}` — Get contact info by ID
- `GET /api/contact-info/people/{person_id}` — List all contact info for a person
- `PUT /api/contact-info/{id}` — Update contact info
- `DELETE /api/contact-info/{id}` — Delete contact info

#### Tags & Categorization
- `POST /api/tags` — Create tag
- `GET /api/tags` — List all tags
- `GET /api/tags/{id}` — Get tag details
- `PUT /api/tags/{id}` — Update tag
- `DELETE /api/tags/{id}` — Delete tag
- `POST /api/tags/{tag_id}/people/{person_id}` — Add tag to person
- `DELETE /api/tags/{tag_id}/people/{person_id}` — Remove tag from person
- `GET /api/tags/{tag_id}/people` — List all people with a tag
- `GET /api/tags/people/{person_id}` — List all tags for a person

#### Person Relationships
- `POST /api/relationships` — Create relationship (family, friend, colleague, etc.)
- `GET /api/relationships` — List all relationships
- `GET /api/relationships/{id}` — Get relationship details
- `GET /api/relationships/people/{person_id}` — List all relationships for a person
- `PUT /api/relationships/{id}` — Update relationship
- `DELETE /api/relationships/{id}` — Delete relationship

#### Associations (Circle/Event/Brand Memberships)
**Circle Members**:
- `POST /api/associations/circle-members` — Add person to circle
- `DELETE /api/associations/circle-members/{circle_id}/{person_id}` — Remove person from circle
- `GET /api/associations/circle-members/{circle_id}` — List all members in a circle

**Event Participants**:
- `POST /api/associations/event-participants` — Add person to event with optional role
- `DELETE /api/associations/event-participants/{event_id}/{person_id}` — Remove person from event
- `PUT /api/associations/event-participants/{event_id}/{person_id}/role` — Update participant role (managed via type category `event-participant-role`)
- `GET /api/associations/event-participants/{event_id}` — List all participants in an event

## Development

### Running Tests

```bash
pytest backend/tests/
```

With coverage report:
```bash
pytest backend/tests/ --cov=app --cov-report=html
```

### Code Quality

Format code:
```bash
black backend/app
isort backend/app
```

Lint code:
```bash
flake8 backend/app
mypy backend/app
```

### Database Migrations

Migrations are defined in `app/infrastructure/migrations.py` and applied on startup.

When changing schema-related models:
```bash
cd backend
uvicorn app.main:app --reload
```

Then add/update a migration step in `run_migrations()` and verify it is idempotent.

## Configuration

All configuration is managed via environment variables (`.env` file):

```env
# Application
APP_NAME=Personal External Memory
DEBUG=True

# Server
HOST=127.0.0.1
PORT=8000

# Database (SQLite by default, supports PostgreSQL/MySQL URLs)
DATABASE_URL=sqlite+aiosqlite:///./pem.db

# Security
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

For production, generate a secure secret key:
```bash
openssl rand -hex 32
```

## Deployment

### Docker Production Build

Build the production Docker image:
```bash
docker build -f Dockerfile -t pem-backend:latest .
```

Run container:
```bash
docker run -p 8000:8000 \
  -e SECRET_KEY=<secure-random-key> \
  -e DATABASE_URL=sqlite+aiosqlite:////data/pem.db \
  -v pem-data:/data \
  pem-backend:latest
```

### Environment Variables for Production

Required environment variables (not in `.env.example`):
- `SECRET_KEY` — Generate with `openssl rand -hex 32`
- `DATABASE_URL` — Use PostgreSQL in production: `postgresql+asyncpg://user:pass@localhost/pem`
- `CORS_ORIGINS` — Set to your frontend domain(s)

## Troubleshooting

### Database Lock Error

If you see "database is locked", the SQLite database is being accessed by multiple processes. For production, use PostgreSQL.

### Import Errors

Ensure you're running commands from the `backend/` directory and have installed dependencies:
```bash
pip install -e ".[dev]"
```

### Port Already in Use

Change the port in `.env` or use:
```bash
PORT=8001 uvicorn app.main:app
```

## Next Steps

1. **Authentication improvements**: Implement refresh token rotation, logout, password reset
2. **Contact management**: Implement contact info endpoints (phone, email, social media)
3. **Tags system**: Implement tag CRUD and person-tag associations
4. **Calendar integration**: Add Google Calendar and Outlook sync
5. **File uploads**: Implement file upload for resources
6. **Search**: Add full-text search across all entities
7. **Notifications**: Add email/push notifications for upcoming events
8. **Analytics**: Add dashboard endpoints for stats and upcoming events

## Technology Stack

- **Framework**: FastAPI 0.115
- **ORM**: SQLAlchemy 2.0 with async
- **Database**: SQLite (SQLite) / PostgreSQL (production)
- **Auth**: JWT with python-jose & passlib
- **Validation**: Pydantic 2.0
- **Testing**: pytest with pytest-asyncio
- **Deployment**: Docker & Docker Compose

## License

MIT
