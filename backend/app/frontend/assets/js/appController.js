import { api, refreshAccessToken, setAuthExpiredHandler } from "./api.js";
import { createFormDataObject, getNodeById } from "./dom.js";
import { createRenderer } from "./render.js";
import { clearSession, saveSession, state } from "./state.js";
import { toIsoDateTime } from "./ui.js";

export function createAppController() {
    const TOKEN_REFRESH_EARLY_MS = 60 * 1000;
    const TOKEN_REFRESH_FALLBACK_MS = 5 * 60 * 1000;
    const NAV_SECTIONS = new Set(["dashboard", "people", "circles", "brands", "events", "tags", "locations", "types", "topology", "calendar"]);
    const ENTITY_KEY_BY_SECTION = {
        people: "personId",
        circles: "circleId",
        brands: "brandId",
        events: "eventId",
        tags: "tagId",
        locations: "locationId",
    };

    const refs = {
        authPanel: getNodeById("auth-panel"),
        authMessage: getNodeById("auth-message"),
        contentPanel: getNodeById("content-panel"),
        navigationPanel: getNodeById("navigation-panel"),
        userEmail: getNodeById("user-email"),
        logoutButton: getNodeById("logout-button"),
        toast: getNodeById("toast"),
        apiStatus: getNodeById("api-status"),
    };

    const caches = {
        personContacts: new Map(),
        personLocations: new Map(),
        circleLocations: new Map(),
        circleEvents: new Map(),
        brandLocations: new Map(),
        eventLocations: new Map(),
        locationAssociations: new Map(),
        personTags: new Map(),
        peopleTagSummaries: new Map(),
        personRelationships: new Map(),
        personAssociations: new Map(),
        circleMembers: new Map(),
        brandMembers: new Map(),
        eventParticipants: new Map(),
        eventCircles: new Map(),
        topology: {
            relationships: [],
            circleMembersByCircleId: new Map(),
            brandMembersByBrandId: new Map(),
            eventParticipantsByEventId: new Map(),
            personBrandAffiliations: new Map(),
        },
    };

    let backgroundRefreshTimerId = null;
    let isApplyingLocationState = false;
    const inFlightEntityDetails = {
        circle: new Map(),
        brand: new Map(),
        event: new Map(),
        location: new Map(),
    };

    function clearBackgroundRefreshTimer() {
        if (backgroundRefreshTimerId !== null) {
            window.clearTimeout(backgroundRefreshTimerId);
            backgroundRefreshTimerId = null;
        }
    }

    function parseTokenExpiryMs(token) {
        if (!token) {
            return null;
        }
        try {
            const tokenParts = token.split(".");
            if (tokenParts.length < 2) {
                return null;
            }
            const payloadBase64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
            const payloadJson = window.atob(payloadBase64);
            const payload = JSON.parse(payloadJson);
            if (!payload.exp) {
                return null;
            }
            return Number(payload.exp) * 1000;
        } catch {
            return null;
        }
    }

    function clearAllCaches() {
        caches.personContacts.clear();
        caches.personLocations.clear();
        caches.circleLocations.clear();
        caches.circleEvents.clear();
        caches.brandLocations.clear();
        caches.eventLocations.clear();
        caches.locationAssociations.clear();
        caches.personTags.clear();
        caches.peopleTagSummaries.clear();
        caches.personRelationships.clear();
        caches.personAssociations.clear();
        caches.circleMembers.clear();
        caches.brandMembers.clear();
        caches.eventParticipants.clear();
        caches.eventCircles.clear();
        caches.topology = {
            relationships: [],
            circleMembersByCircleId: new Map(),
            brandMembersByBrandId: new Map(),
            eventParticipantsByEventId: new Map(),
            personBrandAffiliations: new Map(),
        };
    }

    function endAuthenticatedSession(message = "Session expired. Please sign in again.", isError = true) {
        clearBackgroundRefreshTimer();
        clearSession();
        clearAllCaches();
        renderer.renderAll();
        if (message) {
            setAuthMessage(message);
            showToast(message, isError);
        }
    }

    async function refreshInBackground() {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            endAuthenticatedSession("Session expired. Please sign in again.", true);
            return;
        }
        scheduleBackgroundRefresh();
    }

    function scheduleBackgroundRefresh() {
        clearBackgroundRefreshTimer();

        if (!state.token || !state.refreshToken) {
            return;
        }

        const expiresAtMs = parseTokenExpiryMs(state.token);
        const delayMs = expiresAtMs
            ? Math.max(0, expiresAtMs - Date.now() - TOKEN_REFRESH_EARLY_MS)
            : TOKEN_REFRESH_FALLBACK_MS;

        backgroundRefreshTimerId = window.setTimeout(() => {
            refreshInBackground();
        }, delayMs);
    }

    function clearSelectionState() {
        state.selected.personId = null;
        state.selected.circleId = null;
        state.selected.brandId = null;
        state.selected.eventId = null;
        state.selected.tagId = null;
        state.selected.locationId = null;
        Object.keys(state.sidebar).forEach((section) => {
            state.sidebar[section] = "hidden";
        });
    }

    function applyHashToState() {
        const hash = String(window.location.hash || "").replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const sectionParam = params.get("section") || "dashboard";
        const section = NAV_SECTIONS.has(sectionParam) ? sectionParam : "dashboard";

        clearSelectionState();
        state.activeSection = section;

        const selectedKey = ENTITY_KEY_BY_SECTION[section];
        if (!selectedKey) {
            return;
        }

        const entityId = Number(params.get("id"));
        if (Number.isInteger(entityId) && entityId > 0) {
            state.selected[selectedKey] = entityId;
            state.sidebar[section] = "detail";
        }
    }

    function buildHashFromState({ sectionOverride, entityIdOverride } = {}) {
        const section = sectionOverride || state.activeSection || "dashboard";
        const params = new URLSearchParams();
        params.set("section", section);

        const selectedKey = ENTITY_KEY_BY_SECTION[section];
        if (!selectedKey) {
            return params.toString();
        }

        const entityId = entityIdOverride !== undefined
            ? entityIdOverride
            : state.selected[selectedKey];
        if (Number.isInteger(entityId) && entityId > 0) {
            params.set("id", String(entityId));
        }

        return params.toString();
    }

    function writeHashFromState({ replace = false } = {}) {
        if (!state.token || isApplyingLocationState) {
            return;
        }

        const nextHash = buildHashFromState();
        const currentHash = String(window.location.hash || "").replace(/^#/, "");
        if (nextHash === currentHash) {
            return;
        }

        const baseUrl = `${window.location.pathname}${window.location.search}`;
        const nextUrl = `${baseUrl}#${nextHash}`;
        if (replace) {
            window.history.replaceState({ hash: nextHash }, "", nextUrl);
        } else {
            window.history.pushState({ hash: nextHash }, "", nextUrl);
        }
    }

    function openViewInNewTab(section, entityId = null) {
        const hash = buildHashFromState({ sectionOverride: section, entityIdOverride: entityId });
        const targetUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
        window.open(targetUrl, "_blank", "noopener,noreferrer");
    }

    function selectionExists(section) {
        switch (section) {
            case "people":
                return state.data.people.some((entry) => entry.id === state.selected.personId);
            case "circles":
                return state.data.circles.some((entry) => entry.id === state.selected.circleId);
            case "brands":
                return state.data.brands.some((entry) => entry.id === state.selected.brandId);
            case "events":
                return state.data.events.some((entry) => entry.id === state.selected.eventId);
            case "tags":
                return state.data.tags.some((entry) => entry.id === state.selected.tagId);
            case "locations":
                return state.data.locations.some((entry) => entry.id === state.selected.locationId);
            default:
                return true;
        }
    }

    function sanitizeSelectionState() {
        Object.keys(ENTITY_KEY_BY_SECTION).forEach((section) => {
            const selectedKey = ENTITY_KEY_BY_SECTION[section];
            const selectedId = state.selected[selectedKey];
            if (!selectedId) {
                state.sidebar[section] = "hidden";
                return;
            }

            if (!selectionExists(section)) {
                state.selected[selectedKey] = null;
                state.sidebar[section] = "hidden";
            }
        });
    }

    async function applyLocationStateFromHash() {
        if (!state.token || isApplyingLocationState) {
            return;
        }

        isApplyingLocationState = true;
        try {
            applyHashToState();
            sanitizeSelectionState();
            await refreshSelectedEntityCaches();
            renderer.renderAll();
            writeHashFromState({ replace: true });
        } finally {
            isApplyingLocationState = false;
        }
    }

    function resetSidebar(section) {
        state.sidebar[section] = "hidden";
        switch (section) {
            case "people":
                state.selected.personId = null;
                break;
            case "circles":
                state.selected.circleId = null;
                break;
            case "brands":
                state.selected.brandId = null;
                break;
            case "events":
                state.selected.eventId = null;
                break;
            case "tags":
                state.selected.tagId = null;
                break;
            case "locations":
                state.selected.locationId = null;
                break;
            default:
                break;
        }
    }

    function openCreateSidebar(section) {
        resetSidebar(section);
        state.sidebar[section] = "create";
        renderer.renderAll();
        writeHashFromState();
    }

    function dayKeyToLocalDateTime(dayKey) {
        if (!dayKey) {
            return "";
        }
        return `${dayKey}T00:00`;
    }

    function prefillEventCreateFormForDay(dayKey) {
        const formNode = getNodeById("event-form");
        if (!formNode) {
            return;
        }
        const startInput = formNode.querySelector("input[name='start_time']");
        const endInput = formNode.querySelector("input[name='end_time']");
        const localDateTime = dayKeyToLocalDateTime(dayKey);
        if (startInput) {
            startInput.value = localDateTime;
        }
        if (endInput) {
            endInput.value = localDateTime;
        }
    }

    function setAuthMessage(message) {
        refs.authMessage.innerText = message;
    }

    function showToast(message, isError = false) {
        refs.toast.innerText = message;
        refs.toast.style.background = isError
            ? "var(--toast-error-bg)"
            : "var(--toast-bg)";
        refs.toast.classList.add("visible");
        window.clearTimeout(showToast.timeoutId);
        showToast.timeoutId = window.setTimeout(() => {
            refs.toast.classList.remove("visible");
        }, 2600);
    }

    function setApiStatus(message, healthy = true) {
        refs.apiStatus.innerText = message;
        refs.apiStatus.style.borderColor = healthy
            ? "var(--status-ok-line)"
            : "var(--status-error-line)";
    }

    async function withAction(action, options = { render: true }) {
        try {
            await action();
            if (options.render) {
                renderer.renderAll();
                writeHashFromState();
            }
        } catch (error) {
            if (error?.code === "AUTH_EXPIRED") {
                return;
            }
            showToast(error.message || "Action failed", true);
        }
    }

    function optionalFields(payload, keys) {
        keys.forEach((key) => {
            if (payload[key] === "") {
                delete payload[key];
            }
        });
        return payload;
    }

    async function refreshSelectedEntityCaches() {
        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
        }
        if (state.selected.circleId) {
            await Promise.all([
                loadCircleMembers(state.selected.circleId),
                loadCircleLocations(state.selected.circleId),
                loadCircleEvents(state.selected.circleId),
            ]);
        }
        if (state.selected.brandId) {
            await Promise.all([
                loadBrandMembers(state.selected.brandId),
                loadBrandLocations(state.selected.brandId),
            ]);
        }
        if (state.selected.eventId) {
            await Promise.all([
                loadEventParticipants(state.selected.eventId),
                loadEventLocations(state.selected.eventId),
                loadEventCircles(state.selected.eventId),
            ]);
        }
        if (state.selected.locationId) {
            await loadLocationAssociations(state.selected.locationId);
        }
    }

    async function checkApi() {
        try {
            await api.health();
            setApiStatus("API ready", true);
        } catch {
            setApiStatus("API unavailable", false);
        }
    }

    async function refreshBaseData() {
        const [people, circles, brands, events, tags, locations, contactInfoTypes, relationshipTypes, socialCircleTypes, eventTypes, eventParticipantRoleTypes, brandMembershipTypes, locationTypes] = await Promise.all([
            api.people.list(),
            api.circles.list(),
            api.brands.list(),
            api.events.list(),
            api.tags.list(),
            api.locations.list(),
            api.types.list("contact-info"),
            api.types.list("relationship"),
            api.types.list("social-circle"),
            api.types.list("event"),
            api.types.list("event-participant-role"),
            api.types.list("brand-membership"),
            api.types.list("location"),
        ]);

        state.data.people = people;
        state.data.circles = circles;
        state.data.brands = brands;
        state.data.events = events;
        state.data.tags = tags;
        state.data.locations = locations;
        state.data.typeLists = {
            contactInfoTypes,
            relationshipTypes,
            socialCircleTypes,
            eventTypes,
            eventParticipantRoleTypes,
            brandMembershipTypes,
            locationTypes,
        };

        await refreshTopologyData();
    }

    async function refreshTopologyData() {
        const [relationships] = await Promise.all([
            api.relationships.list(),
        ]);

        const circleMembersByCircleId = new Map(
            state.data.circles.map((circle) => [circle.id, circle.member_ids || []])
        );
        const brandMembersByBrandId = new Map(
            state.data.brands.map((brand) => [brand.id, brand.members || []])
        );
        const eventParticipantsByEventId = new Map(
            state.data.events.map((event) => [event.id, event.participants || []])
        );
        caches.eventLocations = new Map(
            state.data.events.map((event) => [
                event.id,
                (event.location_ids || [])
                    .map((locationId) => state.data.locations.find((entry) => entry.id === locationId))
                    .filter(Boolean),
            ])
        );

        const personBrandAffiliations = new Map(
            state.data.people.map((person) => [person.id, new Set()])
        );

        // Add explicit brand associations
        brandMembersByBrandId.forEach((memberObjects, brandId) => {
            (memberObjects || []).forEach((member) => {
                const personId = member.person_id || member;
                const personSet = personBrandAffiliations.get(personId);
                if (personSet) {
                    personSet.add(brandId);
                }
            });
        });

        // Add heuristic brand affiliations from events
        state.data.brands.forEach((brand) => {
            const needle = String(brand.name || "").toLowerCase().trim();
            if (!needle) {
                return;
            }

            state.data.events.forEach((event) => {
                const eventLocations = caches.eventLocations.get(event.id) || [];
                const matchesBrand = [
                    event.title,
                    event.notes,
                    ...eventLocations.map((location) => location.label),
                    ...eventLocations.map((location) => location.location),
                ]
                    .some((value) => String(value || "").toLowerCase().includes(needle));
                if (!matchesBrand) {
                    return;
                }

                (eventParticipantsByEventId.get(event.id) || []).forEach((participant) => {
                    const personSet = personBrandAffiliations.get(participant.person_id);
                    if (personSet) {
                        personSet.add(brand.id);
                    }
                });
            });
        });

        caches.topology = {
            relationships,
            circleMembersByCircleId,
            brandMembersByBrandId,
            eventParticipantsByEventId,
            personBrandAffiliations,
        };
    }

    async function loadPeopleTagSummaries() {
        const peopleTagSummaries = new Map(
            state.data.people.map((person) => {
                const tags = (person.tags || [])
                    .map((tagSummary) => state.data.tags.find((entry) => entry.id === tagSummary.id) || tagSummary)
                    .filter(Boolean);
                return [person.id, tags];
            })
        );
        caches.peopleTagSummaries = peopleTagSummaries;
    }

    function resolveCreatedEntity(items, previousIds, createdId, matcher) {
        if (createdId !== null && createdId !== undefined) {
            return items.find((item) => item.id === createdId) || null;
        }

        const newItems = items.filter((item) => !previousIds.has(item.id));
        if (newItems.length === 1) {
            return newItems[0];
        }
        if (newItems.length > 1) {
            return newItems.find((item) => matcher(item))
                || [...newItems].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0]
                || null;
        }

        return items.find((item) => matcher(item)) || null;
    }

    async function createAndSelect({ section, selectedKey, collectionKey, createRequest, payload, matcher }) {
        const previousIds = new Set(state.data[collectionKey].map((item) => item.id));
        let created = null;
        let createError = null;

        try {
            created = await createRequest(payload);
        } catch (error) {
            createError = error;
        }

        await refreshBaseData();

        const resolved = resolveCreatedEntity(
            state.data[collectionKey],
            previousIds,
            created?.id,
            matcher
        );

        if (!resolved) {
            if (createError) {
                throw createError;
            }
            throw new Error("Created item could not be loaded.");
        }

        state.selected[selectedKey] = resolved.id;
        state.sidebar[section] = "detail";
        return resolved;
    }

    async function loadPersonCaches(personId) {
        const personDetail = await api.people.get(personId);

        caches.personContacts.set(personId, personDetail.contact_infos || []);
        caches.personLocations.set(personId, personDetail.locations || []);
        caches.personTags.set(
            personId,
            (personDetail.tags || [])
                .map((tagSummary) => state.data.tags.find((entry) => entry.id === tagSummary.id) || tagSummary)
                .filter(Boolean)
        );
        caches.personRelationships.set(personId, personDetail.relationships || []);

        const circleIds = personDetail.circle_ids || [];
        const eventIds = personDetail.event_ids || [];
        const explicitBrandIds = personDetail.explicit_brand_ids || [];

        // Heuristic affiliations from event context
        const associatedEvents = state.data.events.filter((event) => eventIds.includes(event.id));
        const heuristicBrandIds = state.data.brands
            .filter((brand) => {
                const needle = brand.name.toLowerCase();
                return associatedEvents.some((event) => {
                    const eventLocations = caches.eventLocations.get(event.id) || [];
                    return eventLocations.some((location) => String(location.location || "").toLowerCase().includes(needle))
                        || eventLocations.some((location) => String(location.label || "").toLowerCase().includes(needle))
                        || String(event.notes || "").toLowerCase().includes(needle)
                        || String(event.title || "").toLowerCase().includes(needle);
                });
            })
            .map((brand) => brand.id);

        const brandIds = [...new Set([...explicitBrandIds, ...heuristicBrandIds])];

        caches.personAssociations.set(personId, {
            circleIds,
            eventIds,
            brandIds,
            explicitBrandIds,
        });
    }

    async function loadCircleDetail(circleId) {
        if (inFlightEntityDetails.circle.has(circleId)) {
            await inFlightEntityDetails.circle.get(circleId);
            return;
        }
        const request = (async () => {
            const circle = await api.circles.get(circleId);
            caches.circleMembers.set(circleId, circle.member_ids || []);
            caches.circleLocations.set(
                circleId,
                (circle.location_ids || [])
                    .map((locationId) => state.data.locations.find((entry) => entry.id === locationId))
                    .filter(Boolean)
            );
            caches.circleEvents.set(
                circleId,
                state.data.events.filter((event) => (circle.event_ids || []).includes(event.id))
            );
        })();
        inFlightEntityDetails.circle.set(circleId, request);
        try {
            await request;
        } finally {
            inFlightEntityDetails.circle.delete(circleId);
        }
    }

    async function loadCircleMembers(circleId) {
        await loadCircleDetail(circleId);
    }

    async function loadCircleLocations(circleId) {
        await loadCircleDetail(circleId);
    }

    async function loadCircleEvents(circleId) {
        await loadCircleDetail(circleId);
    }

    async function loadBrandDetail(brandId) {
        if (inFlightEntityDetails.brand.has(brandId)) {
            await inFlightEntityDetails.brand.get(brandId);
            return;
        }
        const request = (async () => {
            const brand = await api.brands.get(brandId);
            caches.brandMembers.set(brandId, brand.members || []);
            caches.brandLocations.set(
                brandId,
                (brand.location_ids || [])
                    .map((locationId) => state.data.locations.find((entry) => entry.id === locationId))
                    .filter(Boolean)
            );
        })();
        inFlightEntityDetails.brand.set(brandId, request);
        try {
            await request;
        } finally {
            inFlightEntityDetails.brand.delete(brandId);
        }
    }

    async function loadBrandMembers(brandId) {
        await loadBrandDetail(brandId);
    }

    async function loadBrandLocations(brandId) {
        await loadBrandDetail(brandId);
    }

    async function loadEventDetail(eventId) {
        if (inFlightEntityDetails.event.has(eventId)) {
            await inFlightEntityDetails.event.get(eventId);
            return;
        }
        const request = (async () => {
            const event = await api.events.get(eventId);
            caches.eventParticipants.set(eventId, event.participants || []);
            caches.eventCircles.set(
                eventId,
                state.data.circles.filter((circle) => (event.circle_ids || []).includes(circle.id))
            );
            caches.eventLocations.set(
                eventId,
                (event.location_ids || [])
                    .map((locationId) => state.data.locations.find((entry) => entry.id === locationId))
                    .filter(Boolean)
            );
        })();
        inFlightEntityDetails.event.set(eventId, request);
        try {
            await request;
        } finally {
            inFlightEntityDetails.event.delete(eventId);
        }
    }

    async function loadEventParticipants(eventId) {
        await loadEventDetail(eventId);
    }

    async function loadEventCircles(eventId) {
        await loadEventDetail(eventId);
    }

    async function loadEventLocations(eventId) {
        await loadEventDetail(eventId);
    }

    async function loadLocationDetail(locationId) {
        if (inFlightEntityDetails.location.has(locationId)) {
            await inFlightEntityDetails.location.get(locationId);
            return;
        }
        const request = (async () => {
            const location = await api.locations.get(locationId);
            caches.locationAssociations.set(locationId, location.associations || []);
        })();
        inFlightEntityDetails.location.set(locationId, request);
        try {
            await request;
        } finally {
            inFlightEntityDetails.location.delete(locationId);
        }
    }

    async function loadLocationAssociations(locationId) {
        await loadLocationDetail(locationId);
    }

    async function bootstrapAuthenticated() {
        await refreshBaseData();
        await loadPeopleTagSummaries();
        sanitizeSelectionState();

        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
        }
        if (state.selected.circleId) {
            await Promise.all([
                loadCircleMembers(state.selected.circleId),
                loadCircleLocations(state.selected.circleId),
                loadCircleEvents(state.selected.circleId),
            ]);
        }
        if (state.selected.brandId) {
            await Promise.all([
                loadBrandMembers(state.selected.brandId),
                loadBrandLocations(state.selected.brandId),
            ]);
        }
        if (state.selected.eventId) {
            await Promise.all([
                loadEventParticipants(state.selected.eventId),
                loadEventLocations(state.selected.eventId),
                loadEventCircles(state.selected.eventId),
            ]);
        }
        if (state.selected.locationId) {
            await loadLocationAssociations(state.selected.locationId);
        }

        renderer.renderAll();
    }

    async function handleAuthSubmit(mode, event) {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = createFormDataObject(form);

        try {
            if (mode === "register") {
                await api.auth.register(payload);
                setAuthMessage("Account created. Sign in with the same credentials.");
                form.reset();
            } else {
                const tokens = await api.auth.login(payload);
                saveSession(tokens.access_token, payload.email, tokens.refresh_token);
                setAuthMessage("Signed in.");
                applyHashToState();
                await bootstrapAuthenticated();
                writeHashFromState({ replace: true });
                scheduleBackgroundRefresh();
                showToast("Logged in.");
            }
        } catch (error) {
            showToast(error.message || "Authentication failed", true);
            setAuthMessage(error.message || "Authentication failed");
        }
    }

    function bindAuthTabs() {
        document.querySelectorAll("[data-auth-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                const tab = button.dataset.authTab;
                document.querySelectorAll("[data-auth-tab]").forEach((entry) => {
                    entry.classList.toggle("active", entry === button);
                });

                const loginForm = getNodeById("login-form");
                const registerForm = getNodeById("register-form");

                switch (tab) {
                    case "register":
                        loginForm.classList.add("hidden");
                        registerForm.classList.remove("hidden");
                        break;
                    case "login":
                    default:
                        loginForm.classList.remove("hidden");
                        registerForm.classList.add("hidden");
                        break;
                }
            });
        });
    }

    function bindStaticHandlers() {
        bindAuthTabs();

        getNodeById("login-form").addEventListener("submit", (event) => {
            handleAuthSubmit("login", event);
        });

        getNodeById("register-form").addEventListener("submit", (event) => {
            handleAuthSubmit("register", event);
        });

        refs.logoutButton.addEventListener("click", () => {
            endAuthenticatedSession("", false);
            showToast("Logged out.");
        });

        document.querySelectorAll("[data-filter-section]").forEach((inputNode) => {
            inputNode.addEventListener("input", (event) => {
                const section = inputNode.dataset.filterSection;
                if (!section) {
                    return;
                }
                state.filters[section] = event.target.value;
                renderer.renderAll();
            });
        });

        document.querySelectorAll(".nav-button").forEach((button) => {
            button.addEventListener("click", () => {
                state.activeSection = button.dataset.section;
                if (state.sidebar[state.activeSection] !== undefined) {
                    resetSidebar(state.activeSection);
                }
                renderer.setAuthShell();
                renderer.renderAll();
                writeHashFromState();
            });
        });

        document.querySelectorAll("[data-new-section]").forEach((button) => {
            button.addEventListener("click", () => {
                const section = button.dataset.newSection;
                if (section && state.sidebar[section] !== undefined) {
                    openCreateSidebar(section);
                }
            });
        });

        getNodeById("person-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = createFormDataObject(formNode);
                optionalFields(payload, ["last_name", "notes"]);
                if (payload.birth_date) {
                    payload.birth_date = payload.birth_date;
                } else {
                    delete payload.birth_date;
                }
                if (payload.date_of_death) {
                    payload.date_of_death = payload.date_of_death;
                } else {
                    delete payload.date_of_death;
                }

                await createAndSelect({
                    section: "people",
                    selectedKey: "personId",
                    collectionKey: "people",
                    createRequest: (data) => api.people.create(data),
                    payload,
                    matcher: (person) => person.first_name === payload.first_name
                        && (person.last_name || "") === (payload.last_name || "")
                        && (person.birth_date || null) === (payload.birth_date || null)
                        && (person.date_of_death || null) === (payload.date_of_death || null)
                        && (person.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Person created.");
            });
        });

        getNodeById("circle-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(formNode), ["circle_type", "description", "notes"]);
                await createAndSelect({
                    section: "circles",
                    selectedKey: "circleId",
                    collectionKey: "circles",
                    createRequest: (data) => api.circles.create(data),
                    payload,
                    matcher: (circle) => circle.name === payload.name
                        && (circle.circle_type || "") === (payload.circle_type || "")
                        && (circle.description || "") === (payload.description || "")
                        && (circle.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Circle created.");
            });
        });

        getNodeById("brand-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(formNode), ["description", "notes"]);
                await createAndSelect({
                    section: "brands",
                    selectedKey: "brandId",
                    collectionKey: "brands",
                    createRequest: (data) => api.brands.create(data),
                    payload,
                    matcher: (brand) => brand.name === payload.name
                        && (brand.description || "") === (payload.description || "")
                        && (brand.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Brand created.");
            });
        });

        getNodeById("event-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(formNode), ["title", "event_type", "start_time", "end_time", "notes"]);
                if (payload.start_time) {
                    payload.start_time = toIsoDateTime(payload.start_time);
                }
                if (payload.end_time) {
                    payload.end_time = toIsoDateTime(payload.end_time);
                }
                payload.date = payload.start_time || payload.end_time || new Date().toISOString();
                await createAndSelect({
                    section: "events",
                    selectedKey: "eventId",
                    collectionKey: "events",
                    createRequest: (data) => api.events.create(data),
                    payload,
                    matcher: (entry) => (entry.title || "") === (payload.title || "")
                        && (entry.event_type || "") === (payload.event_type || "")
                        && entry.date === payload.date
                        && (entry.start_time || null) === (payload.start_time || null)
                        && (entry.end_time || null) === (payload.end_time || null)
                        && (entry.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Event created.");
            });
        });

        getNodeById("tag-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(formNode), ["description"]);
                await createAndSelect({
                    section: "tags",
                    selectedKey: "tagId",
                    collectionKey: "tags",
                    createRequest: (data) => api.tags.create(data),
                    payload,
                    matcher: (tag) => tag.name === payload.name
                        && (tag.description || "") === (payload.description || ""),
                });
                formNode.reset();
                showToast("Tag created.");
            });
        });
    }

    const actions = {
        selectPerson: async (personId) => withAction(async () => {
            state.selected.personId = personId;
            state.sidebar.people = "detail";
            await loadPersonCaches(personId);
        }),
        deletePerson: async (personId) => withAction(async () => {
            await api.people.remove(personId);
            if (state.selected.personId === personId) {
                resetSidebar("people");
            }
            await refreshBaseData();
            showToast("Person removed.");
        }),
        addContact: async (payload) => withAction(async () => {
            await api.contactInfo.create(payload);
            await loadPersonCaches(payload.person_id);
            showToast("Contact info added.");
        }),
        updateContact: async (contactId, payload) => withAction(async () => {
            await api.contactInfo.update(contactId, payload);
            const allContacts = Array.from(caches.personContacts.values()).flat();
            const contact = allContacts.find((entry) => entry.id === contactId);
            const personIdToRefresh = contact?.person_id || state.selected.personId;
            if (personIdToRefresh) {
                await loadPersonCaches(personIdToRefresh);
            }
            showToast("Contact info updated.");
        }),
        createLocationForPerson: async (personId, payload) => withAction(async () => {
            const location = await api.locations.create(payload);
            await api.locations.associate(location.id, "person", personId);
            await refreshBaseData();
            await loadPersonCaches(personId);
            showToast("Location added.");
        }),
        associateLocationToPerson: async (locationId, personId) => withAction(async () => {
            await api.locations.associate(locationId, "person", personId);
            await loadPersonCaches(personId);
            showToast("Location assigned.");
        }),
        removeLocationFromPerson: async (locationId, personId) => withAction(async () => {
            await api.locations.removeAssociation(locationId, "person", personId);
            await loadPersonCaches(personId);
            showToast("Location removed.");
        }),
        removeContact: async (contactId, personId) => withAction(async () => {
            await api.contactInfo.remove(contactId);
            await loadPersonCaches(personId);
            showToast("Contact removed.");
        }),
        assignTagToPerson: async (tagId, personId) => withAction(async () => {
            await api.tags.attachToPerson(tagId, personId);
            await loadPersonCaches(personId);
            await loadPeopleTagSummaries();
            showToast("Tag assigned.");
        }),
        removeTagFromPerson: async (tagId, personId) => withAction(async () => {
            await api.tags.detachFromPerson(tagId, personId);
            await loadPersonCaches(personId);
            await loadPeopleTagSummaries();
            showToast("Tag removed.");
        }),
        updatePerson: async (personId, payload) => withAction(async () => {
            await api.people.update(personId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await loadPersonCaches(personId);
            showToast("Person updated.");
        }),
        addRelationship: async (payload) => withAction(async () => {
            await api.relationships.create(payload);
                const personIdsToRefresh = new Set([
                    payload.person_id_1,
                    payload.person_id_2,
                    state.selected.personId,
                ]);
                await Promise.all(
                    [...personIdsToRefresh]
                        .filter((personId) => Number.isInteger(personId))
                        .map((personId) => loadPersonCaches(personId))
                );
            await refreshTopologyData();
            showToast("Relationship created.");
        }),
        deleteRelationship: async (relationshipId, personId) => withAction(async () => {
            await api.relationships.remove(relationshipId);
                if (state.selected.personId) {
                    await loadPersonCaches(state.selected.personId);
                }
            await refreshTopologyData();
            showToast("Relationship removed.");
        }),
        selectCircle: async (circleId) => withAction(async () => {
            state.selected.circleId = circleId;
            state.sidebar.circles = "detail";
            await Promise.all([
                loadCircleMembers(circleId),
                loadCircleLocations(circleId),
                loadCircleEvents(circleId),
            ]);
        }),
        createLocationForCircle: async (circleId, payload) => withAction(async () => {
            const location = await api.locations.create(payload);
            await api.locations.associate(location.id, "social_circle", circleId);
            await refreshBaseData();
            await loadCircleLocations(circleId);
            showToast("Location added.");
        }),
        associateLocationToCircle: async (locationId, circleId) => withAction(async () => {
            await api.locations.associate(locationId, "social_circle", circleId);
            await loadCircleLocations(circleId);
            showToast("Location assigned.");
        }),
        removeLocationFromCircle: async (locationId, circleId) => withAction(async () => {
            await api.locations.removeAssociation(locationId, "social_circle", circleId);
            await loadCircleLocations(circleId);
            showToast("Location removed.");
        }),
        deleteCircle: async (circleId) => withAction(async () => {
            await api.circles.remove(circleId);
            if (state.selected.circleId === circleId) {
                resetSidebar("circles");
            }
            await refreshBaseData();
            showToast("Circle removed.");
        }),
        addCircleMember: async (circleId, personId) => withAction(async () => {
            await api.circles.addMember({ social_circle_id: circleId, person_id: personId });
            await loadCircleMembers(circleId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Member added.");
        }),
        removeCircleMember: async (circleId, personId) => withAction(async () => {
            await api.circles.removeMember(circleId, personId);
            await loadCircleMembers(circleId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Member removed.");
        }),
        updateCircle: async (circleId, payload) => withAction(async () => {
            await api.circles.update(circleId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await Promise.all([
                loadCircleMembers(circleId),
                loadCircleLocations(circleId),
                loadCircleEvents(circleId),
            ]);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Circle updated.");
        }),
        selectBrand: async (brandId) => withAction(async () => {
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
            await Promise.all([
                loadBrandMembers(brandId),
                loadBrandLocations(brandId),
            ]);
        }),
        createLocationForBrand: async (brandId, payload) => withAction(async () => {
            const location = await api.locations.create(payload);
            await api.locations.associate(location.id, "brand", brandId);
            await refreshBaseData();
            await loadBrandLocations(brandId);
            showToast("Location added.");
        }),
        associateLocationToBrand: async (locationId, brandId) => withAction(async () => {
            await api.locations.associate(locationId, "brand", brandId);
            await loadBrandLocations(brandId);
            showToast("Location assigned.");
        }),
        removeLocationFromBrand: async (locationId, brandId) => withAction(async () => {
            await api.locations.removeAssociation(locationId, "brand", brandId);
            await loadBrandLocations(brandId);
            showToast("Location removed.");
        }),
        updateBrand: async (brandId, payload) => withAction(async () => {
            await api.brands.update(brandId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await loadBrandLocations(brandId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Brand updated.");
        }),
        deleteBrand: async (brandId) => withAction(async () => {
            await api.brands.remove(brandId);
            if (state.selected.brandId === brandId) {
                resetSidebar("brands");
            }
            await refreshBaseData();
            showToast("Brand removed.");
        }),
        addBrandMember: async (brandId, personId, type) => withAction(async () => {
            await api.brands.addMember({ brand_id: brandId, person_id: personId, type });
            await loadBrandMembers(brandId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Member added.");
        }),
        changeBrandMemberType: async (brandId, personId, type) => withAction(async () => {
            await api.brands.updateMemberType(brandId, personId, type);
            await loadBrandMembers(brandId);
            showToast("Member type updated.");
        }),
        removeBrandMember: async (brandId, personId) => withAction(async () => {
            await api.brands.removeMember(brandId, personId);
            await loadBrandMembers(brandId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Member removed.");
        }),
        selectEvent: async (eventId) => withAction(async () => {
            state.selected.eventId = eventId;
            state.sidebar.events = "detail";
            await Promise.all([
                loadEventParticipants(eventId),
                loadEventLocations(eventId),
            ]);
        }),
        createLocationForEvent: async (eventId, payload) => withAction(async () => {
            const location = await api.locations.create(payload);
            await api.locations.associate(location.id, "event", eventId);
            await refreshBaseData();
            await loadEventLocations(eventId);
            showToast("Location added.");
        }),
        associateLocationToEvent: async (locationId, eventId) => withAction(async () => {
            await api.locations.associate(locationId, "event", eventId);
            await loadEventLocations(eventId);
            showToast("Location assigned.");
        }),
        removeLocationFromEvent: async (locationId, eventId) => withAction(async () => {
            await api.locations.removeAssociation(locationId, "event", eventId);
            await loadEventLocations(eventId);
            showToast("Location removed.");
        }),
        deleteEvent: async (eventId) => withAction(async () => {
            await api.events.remove(eventId);
            if (state.selected.eventId === eventId) {
                resetSidebar("events");
            }
            await refreshBaseData();
            showToast("Event removed.");
        }),
        addEventParticipant: async (eventId, personId, role) => withAction(async () => {
            await api.events.addParticipant({ event_id: eventId, person_id: personId, role });
            await loadEventParticipants(eventId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Participant added.");
        }),
        changeEventRole: async (eventId, personId, role) => withAction(async () => {
            await api.events.updateParticipantRole(eventId, personId, role);
            await loadEventParticipants(eventId);
            showToast("Role updated.");
        }),
        removeEventParticipant: async (eventId, personId) => withAction(async () => {
            await api.events.removeParticipant(eventId, personId);
            await loadEventParticipants(eventId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Participant removed.");
        }),
        updateEvent: async (eventId, payload) => withAction(async () => {
            await api.events.update(eventId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await Promise.all([
                loadEventParticipants(eventId),
                loadEventLocations(eventId),
                loadEventCircles(eventId),
            ]);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Event updated.");
        }),
        associateCircleToEvent: async (circleId, eventId) => withAction(async () => {
            await api.circles.associateEvent({ social_circle_id: circleId, event_id: eventId });
            await loadEventCircles(eventId);
            showToast("Circle associated with event.");
        }),
        removeCircleFromEvent: async (circleId, eventId) => withAction(async () => {
            await api.circles.removeEvent(circleId, eventId);
            await loadEventCircles(eventId);
            showToast("Circle removed from event.");
        }),
        selectTag: async (tagId) => withAction(async () => {
            state.selected.tagId = tagId;
            state.sidebar.tags = "detail";
        }),
        selectLocation: async (locationId) => withAction(async () => {
            state.selected.locationId = locationId;
            state.sidebar.locations = "detail";
            await loadLocationAssociations(locationId);
        }),
        createLocation: async (payload) => withAction(async () => {
            const created = await createAndSelect({
                section: "locations",
                selectedKey: "locationId",
                collectionKey: "locations",
                createRequest: (data) => api.locations.create(data),
                payload,
                matcher: (location) => (location.label || null) === (payload.label || null) && location.location === payload.location,
            });
            showToast("Location added.");
            return created;
        }),
        updateLocation: async (locationId, payload) => withAction(async () => {
            await api.locations.update(locationId, payload);
            await refreshBaseData();
            await refreshSelectedEntityCaches();
            showToast("Location updated.");
        }),
        deleteLocation: async (locationId) => withAction(async () => {
            await api.locations.remove(locationId);
            if (state.selected.locationId === locationId) {
                resetSidebar("locations");
            }
            await refreshBaseData();
            await refreshSelectedEntityCaches();
            showToast("Location removed.");
        }),
        updateTag: async (tagId, payload) => withAction(async () => {
            await api.tags.update(tagId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await refreshSelectedEntityCaches();
            showToast("Tag updated.");
        }),
        openPersonFromContext: async (personId) => withAction(async () => {
            state.activeSection = "people";
            state.selected.personId = personId;
            state.sidebar.people = "detail";
            await loadPersonCaches(personId);
        }),
        openBrandFromContext: async (brandId) => withAction(async () => {
            state.activeSection = "brands";
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
        }),
        openEventFromContext: async (eventId) => withAction(async () => {
            state.activeSection = "events";
            state.selected.eventId = eventId;
            state.sidebar.events = "detail";
            await Promise.all([
                loadEventParticipants(eventId),
                loadEventLocations(eventId),
            ]);
        }),
        openEventCreateForDate: async (dayKey) => withAction(async () => {
            state.activeSection = "events";
            resetSidebar("events");
            state.sidebar.events = "create";
            prefillEventCreateFormForDay(dayKey);
        }),
        openTagFromContext: async (tagId) => withAction(async () => {
            state.activeSection = "tags";
            state.selected.tagId = tagId;
            state.sidebar.tags = "detail";
        }),
        deleteTag: async (tagId) => withAction(async () => {
            await api.tags.remove(tagId);
            if (state.selected.tagId === tagId) {
                resetSidebar("tags");
            }
            await refreshBaseData();
            await loadPeopleTagSummaries();
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Tag removed.");
        }),
        createType: async (category, payload) => withAction(async () => {
            await api.types.create(category, payload);
            await refreshBaseData();
            showToast("Type created.");
        }),
        updateType: async (category, typeId, payload) => withAction(async () => {
            await api.types.update(category, typeId, payload);
            await refreshBaseData();
            showToast("Type updated.");
        }),
        deleteType: async (category, typeId) => withAction(async () => {
            await api.types.remove(category, typeId);
            await refreshBaseData();
            showToast("Type removed.");
        }),
        openViewInNewTab,
    };

    const renderer = createRenderer({
        state,
        refs,
        caches,
        actions,
    });

    async function init() {
        bindStaticHandlers();
        setAuthExpiredHandler(() => {
            endAuthenticatedSession("Session expired. Please sign in again.", true);
        });
        await checkApi();

        window.addEventListener("hashchange", () => {
            applyLocationStateFromHash();
        });
        window.addEventListener("popstate", () => {
            applyLocationStateFromHash();
        });

        if (state.token) {
            try {
                applyHashToState();
                await bootstrapAuthenticated();
                writeHashFromState({ replace: true });
                scheduleBackgroundRefresh();
            } catch (error) {
                endAuthenticatedSession(error.message || "Session restore failed", true);
            }
        } else {
            renderer.renderAll();
        }
    }

    return {
        init,
    };
}
