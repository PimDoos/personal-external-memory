# Personal External Memory (PEM)
PEM is a people relationship management system. It allows you to keep track of personal relationships and events.

It was inspired by [monica](https://github.com/monicahq/monica).

**Note**: This project is in early development and might not be stable yet. There may be breaking changes in the API and database schema.

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

- Events: Special occasions, like birthdays, anniversaries, or other important dates
    - Has a title
    - Can be associated with people, social circles, or brands, and they can have roles within the event, like "host", "guest", "organizer", etc. (customizable)
    - Date and optionally start/end time
    - Resources related to the event, like the event website, ticket store
    - Location
    - Notes

- Resources: Links or files
    - Can be associated with any entity
    - Files can be uploaded and will be stored locally on the server
    - Links 

- Type management
    - Contact info types
        - Phone
        - Email
        - URL
        - Custom
        - Contact info types can have an URI handler associated with them. If set, this value is prepended to the contact info value to create a link. This will make the contact info clickable and open the associated application. 

    - Relationship types
        - Relationship has two sides
        - Some relationships have different titles for each side
            - Parent-child
        - Some relationships have equal titles for each side
            - Friend
            - Sibling
            - Colleague
            - Partner
            - Date
        - Relationship types can have an emoji associated with them. This will be displayed next to the relationship in the UI.
        
    - Social circle type
    - Event type
    - Event participant role type

- External entities
    - External entities are entities provided by external integrations
    - External entities can have the following properties set: (optional unless specified otherwise)
        - Display name (required)
        - External ID (requied): Uniquely identifies the entity in the source system
        - Click URI: URI to open the entity in the source system
        - Entity type (required): person, location, event, image, text
        - Start date
        - End date
        - Image URL: If set, will be displayed on the entity
        - Latitude & Longitude: If both set, specifies coordinates
        - Content: Any text
        - Source: Name of the source system
    - Examples:
        - Faces from Immich:
            - Type: person
            - Image URL: face photo
            - Display Name: Name of face
            - Source: Immich
        - Entities from Home Assistant
            - Type: person (for person entity), location (for entity with lat/lon set), text (for sensor entity)
            - Display name: entity display name
            - Content: State
            - Latitude & Longitude: from latitude & longitude attributes
            - Source: Home Assistant
    - External entities are read-only and cannot be edited in PEM
    - External entities are synced on app startup and when adding a new association
    - External entities are only visible in the association and do not have their own detail pages. Clicking the association opens the entity in the external system.
    - External entities can be associated with internal entities (people, social circles, brands, events) to enrich their information
    - The integration can specify to which internal entity type(s) the external entity can be associated with.


### User interface
- Dashboard: Overview of upcoming events, recent events, and important dates (like birthdays)
- People management: Create, read, update, and delete people, social circles, brands, events, and resources
- Search and filter: Search for people, social circles, brands, events, and resources, and filter them by any attribute
- Calendar view: View events in a calendar format, with the ability to filter by people, social circles, or brands
- Topology view: Visualize relationships between people, social circles, and brands in an interactive graph format
    - Nodes represent people, social circles, or brands
    - Nodes are round and contain optionally their profile picture if available
    - Nodes have a label with the name of the entity below it
    - Lines represent relationships, affiliations, or social circle memberships
    - Line thickness represents the strength of the relationship, which is calculated based on the number of shared events between the two entities.
    - If a relationship has a type with an emoji, the emoji will be displayed next to the line
    - The graph can be filtered by relationship type, social circle, or brand affiliation to focus on specific connections.
    - Clicking on a node will show that entity's details
    - Nodes are displayed in a force-directed layout, where strongly connected nodes are closer together, and weakly connected nodes are further apart. This allows for an intuitive visualization of the strength of relationships and affiliations.
- Dark mode!

### Integrations
- RESTful API to perform all operations on people, social circles, brands, events, and resources
- Calendar integration: Sync events to and from external calendar applications like Google Calendar or Outlook Calendar
- Contact integration: Sync people to and from external contact management applications like Google Contacts or Microsoft People
- Immich integration: Link people in Immich to people in PEM, and link photos and albums in Immich to people, social circles, brands, or events in PEM
    - Link faces in Immich to people in PEM
        - Immich faces are provided as external entity, which can be linked to a person.
        - If a person has a face from Immich linked, display the face image as avatar for that person
        - Clicking the face association opens the face in Immich
    - Show a small photo gallery on certain detail pages
        - Event detail page: Display photos taken during an event (dynamically fetch from Immich)
        - Location detail page: Display photos taken at a location (dynamically fetch from Immich)
        - Person detail page: Display photos containing that person (dynamically fetch from Immich using the linked face)
        - Clicking the photo opens it in Immich
    - Immich base URL and API key are user-specific and set in user settings.
        - In user settings, the user should be able to test if their settings are valid
- OpenID SSO integration: Authenticate users via OpenID-compliant providers (OAuth2 OIDC)
    - Automatically create new users or link existing users by email
    - Supported flow: Authorization Code Grant with PKCE
    - Pop-up based authentication window
    - Account linking/unlinking from user settings
    - Configuration via environment variables (Issuer URL, Client ID, Client Secret)
    - **Redirect URI**: `https://your-domain/api/auth/openid/callback`
        - For local development: `http://localhost:8000/api/auth/openid/callback`
        - If the client is served over HTTPS (including behind a reverse proxy), use an HTTPS redirect URI.
        - Set `BASE_URI` in production (for example, `https://your-domain`) to guarantee the correct scheme and host for callbacks.
        - Configure this exact URI in your OpenID provider's application settings

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
- **Database**: SQLAlchemy ORM with startup-applied migrations for SQLite (easily switchable to PostgreSQL)
- **API Structure**: RESTful endpoints for all core entities (People, Events, etc.)
- **Testing**: pytest setup with fixtures for async database testing
- **Deployment**: Docker and Docker Compose configuration for local development

**Status**: Ready for feature development and frontend integration

See [src/README.md](src/README.md) for setup instructions and API documentation.

### Frontend ✅
The native frontend is now implemented and served directly by FastAPI.

- **Technology**: Native HTML5, CSS3, and JavaScript modules
- **Access**: Open `http://localhost:8000`
- **Features**: Login/register, dashboard, people, contact info, tags, relationships, social circles, brands, events, and participant management
- **Design**: Responsive single-page interface with no framework dependency

**Status**: Ready for backend integration testing and UI iteration.

### Todo

- Add profile pictures
    - Brands
    - Social Circles

- Add point in time filter to topology view, to visualize the relationships at a specific point in time.
    - People that were not alive at that time are not displayed
    - Relationships that were not active at that time are not displayed
    - Filter is optional. If not set, the topology view shows the current relationships.

- Update calendar view
    - Ability to filter events by people, social circles, tags or brands

