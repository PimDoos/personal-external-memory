# Personal External Memory (PEM)
PEM is a people relationship management system. It allows you to keep track of personal relationships and events.

## Features

### Concepts
- People
    - Personalia (name, birthday)
    - Contact information (address(es), social media handle(s), phone number(s), etc.)
    - Timeline (last time we met, special events, birthday)
    - Affiliations to brands
    - Relationships to other people (family, friends, colleagues, etc.)
    - Notes
    - Tags to categorize people with common attributes, like interests or roles. Tags are fully customizable. Examples:
        - Musicians
        - Gamers
        - People I met at work
        - People I met at school

- Social circles: A collection of people, like a family, a group of friends, or a work team
    - Can have affiliated brands
    - Shared resources: Group chat link, shared calendar, etc.
    - Notes
    
- Brands: Other entities that are not people, like businesses
    - Can have affiliated people or social circles
    - Contact information: Address, phone number(s)
    - Notes

- Interactions: Meetings, calls, messages, etc.
    - Can be associated with one or more people, social circles, or brands
    - Date and optionally start/end time
    - Resources related to the interaction, like a meeting agenda or a call recording
    - Location or medium (like "Zoom", "Phone call", etc.)
    - Notes

- Events: Special occasions, like birthdays, anniversaries, or other important dates
    - Can be associated with people, social circles, or brands, and they can have roles within the event, like "host", "guest", "organizer", etc. (customizable)
    - Date and optionally start/end time
    - Resources related to the event, like the event website, ticket store
    - Location
    - Notes

- Resources: Links or files
    - Can be associated with any entity
    - Files can be uploaded and will be stored locally on the server
    - Links 

### User interface
- Dashboard: Overview of upcoming events, recent interactions, and important dates (like birthdays)
- People management: Create, read, update, and delete people, social circles, brands, interactions, events, and resources
- Search and filter: Search for people, social circles, brands, interactions, events, and resources, and filter them by any attribute
- Calendar view: View events and interactions in a calendar format, with the ability to filter by people, social circles, or brands
- Topology view: Visualize relationships between people, social circles, and brands in an interactive graph format
- Dark mode!

### Integrations
- RESTful API to perform all operations on people, social circles, brands, interactions, events, and resources
- Calendar integration: Sync events to and from external calendar applications like Google Calendar or Outlook Calendar
- Contact integration: Sync people to and from external contact management applications like Google Contacts or Microsoft People
- Immich integration: Link people in Immich to people in PEM, and link photos and albums in Immich to people, social circles, brands, interactions, or events in PEM

## Technology Stack
- Backend: Python with FastAPI
- Database: SQLite
- Frontend: Native HTML5, CSS3 and JavaScript (no frameworks, minimal libraries)
- Deployment: Docker compose

## Project Status

### Backend ✅
The Python backend groundwork is complete with:
- **Architecture**: Domain-driven design with clear separation of concerns
- **Authentication**: JWT-based user authentication with secure password hashing
- **Database**: SQLAlchemy ORM with Alembic migrations for SQLite (easily switchable to PostgreSQL)
- **API Structure**: RESTful endpoints for all core entities (People, Events, Interactions, etc.)
- **Testing**: pytest setup with fixtures for async database testing
- **Deployment**: Docker and Docker Compose configuration for local development

**Status**: Ready for feature development and frontend integration

See [backend/README.md](backend/README.md) for setup instructions and API documentation.

### Frontend ✅
The native frontend is now implemented and served directly by FastAPI.

- **Technology**: Native HTML5, CSS3, and JavaScript modules
- **Access**: Open `http://localhost:8000`
- **Features**: Login/register, dashboard, people, contact info, tags, relationships, social circles, brands, events, interactions, and participant management
- **Design**: Responsive single-page interface with no framework dependency

**Status**: Ready for backend integration testing and UI iteration.

