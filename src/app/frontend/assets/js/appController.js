import { api, refreshAccessToken, setAuthExpiredHandler } from "./api.js";
import { createFormDataObject, getNodeById } from "./dom.js";
import { createRenderer } from "./render.js";
import { clearSession, saveSession, state } from "./state.js";
import { toIsoDateTime } from "./ui.js";

export function createAppController() {
    const TOKEN_REFRESH_EARLY_MS = 60 * 1000;
    const TOKEN_REFRESH_FALLBACK_MS = 5 * 60 * 1000;
    const NAV_SECTIONS = new Set(["dashboard", "people", "circles", "brands", "events", "tags", "locations", "types", "settings", "topology", "calendar", "map"]);
    const ENTITY_KEY_BY_SECTION = {
        people: "personId",
        circles: "circleId",
        brands: "brandId",
        events: "eventId",
        tags: "tagId",
        locations: "locationId",
    };
    const DETAIL_PANEL_BY_SECTION = {
        people: "person-detail-panel",
        circles: "circle-detail-panel",
        brands: "brand-detail-panel",
        events: "event-detail-panel",
        tags: "tag-detail-panel",
        locations: "location-detail-panel",
    };

    const refs = {
        authPanel: getNodeById("auth-panel"),
        authMessage: getNodeById("auth-message"),
        openidLoginButton: getNodeById("openid-login-button"),
        contentPanel: getNodeById("content-panel"),
        navigationPanel: getNodeById("navigation-panel"),
        navCollapseToggle: getNodeById("nav-collapse-toggle"),
        userEmail: getNodeById("user-email"),
        logoutButton: getNodeById("logout-button"),
        toast: getNodeById("toast"),
        apiStatus: getNodeById("api-status"),
    };
    const collapsibleNavigationMediaQuery = window.matchMedia("(max-width: 720px)");

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
        immichPersonGallery: new Map(),
        immichEventGallery: new Map(),
        immichLocationGallery: new Map(),
        immichImageBlobUrls: new Map(),
        immichImageFailedAssetIds: new Set(),
        immichFaceAvatarBlobUrls: new Map(),
        immichFaces: [],
        personImmichFaceLink: new Map(),
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
    let pendingViewportJumpSection = null;
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
        caches.immichImageBlobUrls.forEach((objectUrl) => {
            try {
                URL.revokeObjectURL(objectUrl);
            } catch {
                // no-op
            }
        });
        caches.immichImageBlobUrls.clear();
        caches.immichImageFailedAssetIds.clear();
        caches.immichFaceAvatarBlobUrls.forEach((objectUrl) => {
            try {
                URL.revokeObjectURL(objectUrl);
            } catch {
                // no-op
            }
        });
        caches.immichFaceAvatarBlobUrls.clear();

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
        caches.immichPersonGallery.clear();
        caches.immichEventGallery.clear();
        caches.immichLocationGallery.clear();
        caches.immichFaces = [];
        caches.personImmichFaceLink.clear();
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
        checkApi();
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

    function setNavigationCollapsed(collapsed) {
        if (!refs.navigationPanel || !refs.navCollapseToggle) {
            return;
        }

        const shouldCollapse = collapsibleNavigationMediaQuery.matches ? Boolean(collapsed) : false;
        refs.navigationPanel.classList.toggle("nav-panel--collapsed", shouldCollapse);
        refs.navCollapseToggle.setAttribute("aria-expanded", String(!shouldCollapse));
        refs.navCollapseToggle.innerText = shouldCollapse ? "Show navigation" : "Hide navigation";
    }

    function syncNavigationCollapseForViewport() {
        if (!collapsibleNavigationMediaQuery.matches) {
            setNavigationCollapsed(false);
            return;
        }
        if (!refs.navigationPanel.classList.contains("nav-panel--collapsed")) {
            setNavigationCollapsed(true);
            return;
        }
        setNavigationCollapsed(true);
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

    function requestViewportJump(section) {
        pendingViewportJumpSection = section;
    }

    function flushViewportJump() {
        const section = pendingViewportJumpSection;
        pendingViewportJumpSection = null;
        if (!section || !window.matchMedia("(max-width: 1100px)").matches) {
            return false;
        }

        const detailPanelId = DETAIL_PANEL_BY_SECTION[section];
        if (!detailPanelId) {
            return false;
        }

        const detailPanelNode = document.getElementById(detailPanelId);
        if (!detailPanelNode || detailPanelNode.classList.contains("hidden")) {
            return false;
        }

        detailPanelNode.scrollIntoView({
            behavior: "auto",
            block: "start",
            inline: "nearest",
        });
        return true;
    }

    function setApiStatus(message, healthy = true) {
        refs.apiStatus.innerText = message;
        refs.apiStatus.style.borderColor = healthy
            ? "var(--status-ok-line)"
            : "var(--status-error-line)";
    }

    async function withAction(action, options = {}) {
        const resolvedOptions = {
            render: true,
            ...options,
        };
        const activeSidebarState = state.sidebar[state.activeSection];
        const shouldPreserveViewport = resolvedOptions.preserveViewport ?? activeSidebarState === "detail";
        const viewportBeforeAction = shouldPreserveViewport
            ? { left: window.scrollX, top: window.scrollY }
            : null;
        try {
            await action();
            if (resolvedOptions.render) {
                renderer.renderAll();
                writeHashFromState();
                const didJump = flushViewportJump();
                if (viewportBeforeAction && !didJump) {
                    window.scrollTo({
                        left: viewportBeforeAction.left,
                        top: viewportBeforeAction.top,
                        behavior: "auto",
                    });
                }
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

    function hasImmichIntegrationConfigured() {
        const settings = state.data.userSettings || {};
        const apiKey = String(settings.immich_api_key || "").trim();
        const baseUrl = String(settings.immich_base_url || "").trim();
        return Boolean(apiKey && baseUrl);
    }

    async function refreshSelectedEntityCaches() {
        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
            if (hasImmichIntegrationConfigured()) {
                await Promise.all([
                    loadImmichGalleryForPerson(state.selected.personId),
                    loadPersonImmichFaceLink(state.selected.personId),
                ]);
            } else {
                caches.immichPersonGallery.set(state.selected.personId, []);
                caches.personImmichFaceLink.set(state.selected.personId, null);
                caches.immichFaces = [];
            }
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
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForEvent(state.selected.eventId);
            } else {
                caches.immichEventGallery.set(state.selected.eventId, []);
            }
        }
        if (state.selected.locationId) {
            await loadLocationAssociations(state.selected.locationId);
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForLocation(state.selected.locationId);
            } else {
                caches.immichLocationGallery.set(state.selected.locationId, []);
            }
        }
    }

    async function checkApi() {
        try {
            await api.health();
            try {
                const openid = await api.auth.openidConfig();
                state.data.auth.openidEnabled = Boolean(openid?.enabled);
                state.data.auth.openidButtonText = String(openid?.button_text || "Sign in with SSO");
            } catch {
                state.data.auth.openidEnabled = false;
                state.data.auth.openidButtonText = "Sign in with SSO";
            }
            setApiStatus("API ready", true);
        } catch {
            state.data.auth.openidEnabled = false;
            state.data.auth.openidButtonText = "Sign in with SSO";
            setApiStatus("API unavailable", false);
        }

        if (refs.openidLoginButton) {
            refs.openidLoginButton.innerText = state.data.auth.openidButtonText;
            refs.openidLoginButton.hidden = !state.data.auth.openidEnabled;
        }
    }

    async function startOpenIdLogin() {
        if (!state.data.auth?.openidEnabled) {
            throw new Error("OpenID SSO is not configured");
        }
        const response = await api.auth.openidLoginUrl();
        const authUrl = String(response?.authorization_url || "").trim();
        if (!authUrl) {
            throw new Error("OpenID authorization URL is missing");
        }
        window.location.href = authUrl;
    }

    async function startOpenIdLink() {
        const response = await api.auth.openidLinkUrl();
        const authUrl = String(response?.authorization_url || "").trim();
        if (!authUrl) {
            throw new Error("OpenID authorization URL is missing");
        }
        window.location.href = authUrl;
    }

    async function restoreOpenIdCallback() {
        const callbackData = localStorage.getItem("openid_callback");
        if (callbackData) {
            try {
                const data = JSON.parse(callbackData);
                localStorage.removeItem("openid_callback");
                if (data.access_token && data.refresh_token && data.email) {
                    saveSession(data.access_token, data.email, data.refresh_token);
                    setAuthMessage("Signed in.");
                    applyHashToState();
                    await bootstrapAuthenticated();
                    writeHashFromState({ replace: true });
                    scheduleBackgroundRefresh();
                    showToast("Logged in via OpenID.");
                    return;
                }
            } catch (e) {
                localStorage.removeItem("openid_callback");
            }
        }

        const linkSuccess = localStorage.getItem("openid_link_success");
        if (linkSuccess) {
            localStorage.removeItem("openid_link_success");
            await refreshBaseData();
            await refreshSelectedEntityCaches();
            renderer.renderAll();
            showToast("OpenID account linked.");
        }

        const errorData = localStorage.getItem("openid_error");
        if (errorData) {
            try {
                const error = JSON.parse(errorData);
                localStorage.removeItem("openid_error");
                const message = error.error || "OpenID authentication failed";
                setAuthMessage(message);
                showToast(message, true);
            } catch (e) {
                localStorage.removeItem("openid_error");
            }
        }
    }

    async function refreshBaseData() {
        const [people, circles, brands, events, tags, locations, contactInfoTypes, relationshipTypes, socialCircleTypes, eventTypes, eventParticipantRoleTypes, brandMembershipTypes, locationTypes, userSettings] = await Promise.all([
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
            api.settings.get(),
        ]);

        state.data.people = people;
        state.data.circles = circles;
        state.data.brands = brands;
        state.data.events = events;
        state.data.tags = tags;
        state.data.locations = locations;
        const preloadedLocationAssociations = new Map();
        locations.forEach((location) => {
            if (Array.isArray(location.associations)) {
                preloadedLocationAssociations.set(location.id, location.associations);
            }
        });
        caches.locationAssociations = preloadedLocationAssociations;
        state.data.typeLists = {
            contactInfoTypes,
            relationshipTypes,
            socialCircleTypes,
            eventTypes,
            eventParticipantRoleTypes,
            brandMembershipTypes,
            locationTypes,
        };
        state.data.userSettings = {
            me_person_id: userSettings?.me_person_id || null,
            immich_api_key: userSettings?.immich_api_key || null,
            immich_base_url: userSettings?.immich_base_url || null,
            home_assistant_api_key: userSettings?.home_assistant_api_key || null,
            home_assistant_base_url: userSettings?.home_assistant_base_url || null,
            openid_linked: Boolean(userSettings?.openid_linked),
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

    async function loadImmichGalleryForPerson(personId) {
        if (!hasImmichIntegrationConfigured()) {
            caches.immichPersonGallery.set(personId, []);
            return;
        }

        try {
            const response = await api.immich.galleryForPerson(personId, 24);
            caches.immichPersonGallery.set(personId, response?.items || []);
        } catch {
            caches.immichPersonGallery.set(personId, []);
        }
    }

    async function loadPersonImmichFaceLink(personId) {
        if (!hasImmichIntegrationConfigured()) {
            caches.immichFaces = [];
            caches.personImmichFaceLink.set(personId, null);
            return;
        }

        try {
            const immichFaces = await api.externalIdentities.listImmichPersonFaces(personId);
            caches.immichFaces = immichFaces;

            const linkedIdentity = (immichFaces || []).find(
                (face) => Number(face.linked_person_id) === Number(personId) && Number(face.linked_association_id) > 0
            ) || null;
            const linkedFace = linkedIdentity
                ? {
                    identity: linkedIdentity,
                    associationId: linkedIdentity.linked_association_id,
                }
                : null;

            caches.personImmichFaceLink.set(personId, linkedFace);
        } catch {
            // Keep previously loaded faces when list request fails transiently.
            if (!Array.isArray(caches.immichFaces)) {
                caches.immichFaces = [];
            }
            caches.personImmichFaceLink.set(personId, null);
        }
    }

    async function preloadAllPersonFaceLinks() {
        if (!hasImmichIntegrationConfigured()) {
            return;
        }
        try {
            const allFaces = await api.externalIdentities.listImmichPersonFaces();
            caches.immichFaces = allFaces || [];

            // Build a lookup from person_id → linked face identity
            const linkedByPersonId = new Map();
            for (const face of allFaces || []) {
                const personId = Number(face.linked_person_id);
                const assocId = Number(face.linked_association_id);
                if (personId > 0 && assocId > 0) {
                    linkedByPersonId.set(personId, {
                        identity: face,
                        associationId: assocId,
                    });
                }
            }

            // Populate the cache for all people currently in state
            for (const person of state.data.people || []) {
                if (!caches.personImmichFaceLink.has(person.id)) {
                    caches.personImmichFaceLink.set(person.id, linkedByPersonId.get(person.id) || null);
                }
            }

            renderer.renderAll();
        } catch {
            // Non-critical — leave cache empty, initials will be shown
        }
    }

    async function loadImmichGalleryForEvent(eventId) {
        if (!hasImmichIntegrationConfigured()) {
            caches.immichEventGallery.set(eventId, []);
            return;
            return;
        }

        try {
            const response = await api.immich.galleryForEvent(eventId, 24);
            caches.immichEventGallery.set(eventId, response?.items || []);
        } catch {
            caches.immichEventGallery.set(eventId, []);
        }
    }

    async function loadImmichGalleryForLocation(locationId) {
        if (!hasImmichIntegrationConfigured()) {
            caches.immichLocationGallery.set(locationId, []);
            return;
        }

        try {
            const response = await api.immich.galleryForLocation(locationId, 24);
            caches.immichLocationGallery.set(locationId, response?.items || []);
        } catch {
            caches.immichLocationGallery.set(locationId, []);
        }
    }

    async function resolveImmichImageUrl(asset) {
        const assetId = String(asset?.id || asset?.assetId || asset?.asset_id || "").trim();
        if (!assetId) {
            return null;
        }

        if (caches.immichImageFailedAssetIds.has(assetId)) {
            return null;
        }

        const cached = caches.immichImageBlobUrls.get(assetId);
        if (cached) {
            return cached;
        }

        try {
            const blob = await api.immich.thumbnailBlob(assetId, "preview");
            const objectUrl = URL.createObjectURL(blob);
            caches.immichImageBlobUrls.set(assetId, objectUrl);
            return objectUrl;
        } catch (error) {
            caches.immichImageFailedAssetIds.add(assetId);
            const message = String(error?.message || "").toLowerCase();
            if (message.includes("asset.view")) {
                state.data.immich.connectionMessage = "Immich API key missing 'asset.view' permission.";
            }
            return null;
        }
    }

    async function resolveImmichFaceImageUrl(externalIdentityId) {
        const identityId = Number(externalIdentityId);
        if (!Number.isInteger(identityId) || identityId <= 0) {
            return null;
        }

        const cached = caches.immichFaceAvatarBlobUrls.get(identityId);
        if (cached) {
            return cached;
        }

        try {
            const blob = await api.externalIdentities.imageBlob(identityId);
            const objectUrl = URL.createObjectURL(blob);
            caches.immichFaceAvatarBlobUrls.set(identityId, objectUrl);
            return objectUrl;
        } catch {
            return null;
        }
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
        if (caches.locationAssociations.has(locationId)) {
            return;
        }

        const fromList = state.data.locations.find((entry) => entry.id === locationId);
        if (fromList && Array.isArray(fromList.associations)) {
            caches.locationAssociations.set(locationId, fromList.associations);
            return;
        }

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
            if (hasImmichIntegrationConfigured()) {
                await Promise.all([
                    loadImmichGalleryForPerson(state.selected.personId),
                    loadPersonImmichFaceLink(state.selected.personId),
                ]);
            }
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
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForEvent(state.selected.eventId);
            }
        }
        if (state.selected.locationId) {
            await loadLocationAssociations(state.selected.locationId);
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForLocation(state.selected.locationId);
            }
        }

        renderer.renderAll();
        preloadAllPersonFaceLinks();
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
                const loginForm = getNodeById("login-form");
                const registerForm = getNodeById("register-form");
                registerForm.classList.add("hidden");
                loginForm.classList.remove("hidden");
            } else {
                if (!payload.password) {
                    setAuthMessage("Password is required");
                    return;
                }
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
        const passwordSigninButton = getNodeById("password-signin-button");
        const submitLoginButton = getNodeById("submit-login-button");
        const passwordRow = getNodeById("auth-password-row");
        const showRegisterButton = getNodeById("show-register-button");

        if (passwordSigninButton) {
            passwordSigninButton.addEventListener("click", (event) => {
                event.preventDefault();
                passwordRow.classList.remove("hidden");
                submitLoginButton.classList.remove("hidden");
                passwordSigninButton.classList.add("hidden");
            });
        }

        if (showRegisterButton) {
            showRegisterButton.addEventListener("click", (event) => {
                event.preventDefault();
                const loginForm = getNodeById("login-form");
                const registerForm = getNodeById("register-form");
                loginForm.classList.add("hidden");
                registerForm.classList.remove("hidden");
            });
        }
    }

    function bindStaticHandlers() {
        bindAuthTabs();

        getNodeById("login-form").addEventListener("submit", (event) => {
            handleAuthSubmit("login", event);
        });

        getNodeById("register-form").addEventListener("submit", (event) => {
            handleAuthSubmit("register", event);
        });

        if (refs.openidLoginButton) {
            refs.openidLoginButton.addEventListener("click", async () => {
                try {
                    await startOpenIdLogin();
                } catch (error) {
                    const message = error.message || "OpenID authentication failed";
                    setAuthMessage(message);
                    showToast(message, true);
                }
            });
        }

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
                if (collapsibleNavigationMediaQuery.matches) {
                    setNavigationCollapsed(true);
                }
            });
        });

        if (refs.navCollapseToggle) {
            refs.navCollapseToggle.addEventListener("click", () => {
                const isCollapsed = refs.navigationPanel.classList.contains("nav-panel--collapsed");
                setNavigationCollapsed(!isCollapsed);
            });
        }

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

        getNodeById("settings-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = createFormDataObject(formNode);
                payload.me_person_id = payload.me_person_id ? Number(payload.me_person_id) : null;
                payload.immich_api_key = payload.immich_api_key?.trim() || null;
                payload.immich_base_url = payload.immich_base_url?.trim() || null;
                payload.home_assistant_api_key = payload.home_assistant_api_key?.trim() || null;
                payload.home_assistant_base_url = payload.home_assistant_base_url?.trim() || null;
                const savedSettings = await api.settings.update(payload);
                state.data.userSettings = {
                    me_person_id: savedSettings?.me_person_id || null,
                    immich_api_key: savedSettings?.immich_api_key || null,
                    immich_base_url: savedSettings?.immich_base_url || null,
                    home_assistant_api_key: savedSettings?.home_assistant_api_key || null,
                    home_assistant_base_url: savedSettings?.home_assistant_base_url || null,
                    openid_linked: Boolean(savedSettings?.openid_linked),
                };
                await refreshSelectedEntityCaches();
                showToast("Settings saved.");
            });
        });
    }

    const actions = {
        testImmichConnection: async () => withAction(async () => {
            const response = await api.immich.testConnection();
            state.data.immich.connectionMessage = response?.user_email
                ? `${response.message} (${response.user_email})`
                : (response?.message || "Connection successful");
            showToast("Immich connection successful.");
        }),
        syncImmichFaces: async () => withAction(async () => {
            const result = await api.immich.syncFaces();
            state.data.immich.syncMessage = `Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}, total ${result.total_remote}`;
            await refreshBaseData();
            await refreshSelectedEntityCaches();
            showToast("Immich faces synced.");
        }),
        startOpenIdLink: async () => withAction(async () => {
            if (!state.data.auth?.openidEnabled) {
                throw new Error("OpenID SSO is not configured");
            }
            await startOpenIdLink();
            showToast("Complete OpenID linking in the popup window.");
        }, { render: false }),
        unlinkOpenId: async () => withAction(async () => {
            await api.auth.openidUnlink();
            state.data.userSettings.openid_linked = false;
            showToast("OpenID account unlinked.");
        }),
        linkImmichFaceToPerson: async (personId, externalIdentityId) => withAction(async () => {
            if (!personId || !externalIdentityId) {
                return;
            }

            const currentLink = caches.personImmichFaceLink.get(personId);
            if (currentLink && Number(currentLink.identity?.id) !== Number(externalIdentityId)) {
                await api.externalIdentities.removeAssociation(currentLink.identity.id, currentLink.associationId);
            }

            const selectedDetail = await api.externalIdentities.get(externalIdentityId);
            const existingAssociation = (selectedDetail.associations || []).find(
                (assoc) => assoc.entity_type === "person" && Number(assoc.entity_id) === Number(personId)
            );

            if (!existingAssociation) {
                await api.externalIdentities.addAssociation(externalIdentityId, {
                    entity_type: "person",
                    entity_id: Number(personId),
                });
            }

            await Promise.all([
                loadPersonImmichFaceLink(personId),
                loadImmichGalleryForPerson(personId),
            ]);
            showToast("Immich face linked.");
        }),
        unlinkImmichFaceFromPerson: async (personId) => withAction(async () => {
            const currentLink = caches.personImmichFaceLink.get(personId);
            if (!currentLink) {
                return;
            }

            await api.externalIdentities.removeAssociation(currentLink.identity.id, currentLink.associationId);
            await Promise.all([
                loadPersonImmichFaceLink(personId),
                loadImmichGalleryForPerson(personId),
            ]);
            showToast("Immich face unlinked.");
        }),
        refreshImmichPersonGallery: async (personId) => withAction(async () => {
            await loadImmichGalleryForPerson(personId);
        }),
        refreshImmichEventGallery: async (eventId) => withAction(async () => {
            await loadImmichGalleryForEvent(eventId);
        }),
        refreshImmichLocationGallery: async (locationId) => withAction(async () => {
            await loadImmichGalleryForLocation(locationId);
        }),
        resolveImmichImageUrl,
        resolveImmichFaceImageUrl,
        selectPerson: async (personId) => withAction(async () => {
            state.selected.personId = personId;
            state.sidebar.people = "detail";
            requestViewportJump("people");
            await loadPersonCaches(personId);
            if (hasImmichIntegrationConfigured()) {
                await Promise.all([
                    loadImmichGalleryForPerson(personId),
                    loadPersonImmichFaceLink(personId),
                ]);
            } else {
                caches.immichPersonGallery.set(personId, []);
                caches.personImmichFaceLink.set(personId, null);
                caches.immichFaces = [];
            }
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
        }, { preserveViewport: true }),
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
        updateRelationship: async (relationshipId, payload, personId1, personId2, shouldSwapDirection = false) => withAction(async () => {
            if (shouldSwapDirection) {
                await api.relationships.remove(relationshipId);
                await api.relationships.create({
                    person_id_1: personId2,
                    person_id_2: personId1,
                    relationship_type_id: payload.relationship_type_id,
                    start_date: payload.start_date ?? undefined,
                    end_date: payload.end_date ?? undefined,
                    notes: payload.notes ?? undefined,
                });
            } else {
                await api.relationships.update(relationshipId, payload);
            }
            const personIdsToRefresh = new Set([personId1, personId2, state.selected.personId]);
            await Promise.all(
                [...personIdsToRefresh]
                    .filter((personId) => Number.isInteger(personId))
                    .map((personId) => loadPersonCaches(personId))
            );
            await refreshTopologyData();
            showToast("Relationship updated.");
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
            requestViewportJump("circles");
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
        }, { preserveViewport: true }),
        selectBrand: async (brandId) => withAction(async () => {
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
            requestViewportJump("brands");
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
        }, { preserveViewport: true }),
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
            requestViewportJump("events");
            await Promise.all([
                loadEventParticipants(eventId),
                loadEventLocations(eventId),
            ]);
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForEvent(eventId);
            } else {
                caches.immichEventGallery.set(eventId, []);
            }
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
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            await loadEventLocations(eventId);
            showToast("Participant added.");
        }),
        changeEventRole: async (eventId, personId, role) => withAction(async () => {
            await api.events.updateParticipantRole(eventId, personId, role);
            await loadEventLocations(eventId);
            showToast("Role updated.");
        }),
        removeEventParticipant: async (eventId, personId) => withAction(async () => {
            await api.events.removeParticipant(eventId, personId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            await loadEventLocations(eventId);
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
        }, { preserveViewport: true }),
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
            requestViewportJump("tags");
        }),
        selectLocation: async (locationId) => withAction(async () => {
            state.selected.locationId = locationId;
            state.sidebar.locations = "detail";
            requestViewportJump("locations");
            await loadLocationAssociations(locationId);
            if (hasImmichIntegrationConfigured()) {
                await loadImmichGalleryForLocation(locationId);
            } else {
                caches.immichLocationGallery.set(locationId, []);
            }
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
        }, { preserveViewport: true }),
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
        }, { preserveViewport: true }),
        openPersonFromContext: async (personId) => withAction(async () => {
            state.activeSection = "people";
            state.selected.personId = personId;
            state.sidebar.people = "detail";
            requestViewportJump("people");
            await loadPersonCaches(personId);
            if (hasImmichIntegrationConfigured()) {
                await Promise.all([
                    loadImmichGalleryForPerson(personId),
                    loadPersonImmichFaceLink(personId),
                ]);
            } else {
                caches.immichPersonGallery.set(personId, []);
                caches.personImmichFaceLink.set(personId, null);
                caches.immichFaces = [];
            }
        }),
        openBrandFromContext: async (brandId) => withAction(async () => {
            state.activeSection = "brands";
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
            requestViewportJump("brands");
        }),
        openEventFromContext: async (eventId) => withAction(async () => {
            state.activeSection = "events";
            state.selected.eventId = eventId;
            state.sidebar.events = "detail";
            requestViewportJump("events");
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
            requestViewportJump("tags");
        }),
        openMapAtCoordinates: async ({ lat, lon, zoom = 16 }) => withAction(async () => {
            const nextLat = Number(lat);
            const nextLon = Number(lon);
            const nextZoom = Number(zoom);
            if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) {
                return;
            }

            state.activeSection = "map";
            state.mapView.focusTarget = {
                lat: nextLat,
                lon: nextLon,
                zoom: Number.isFinite(nextZoom) ? nextZoom : 16,
            };
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
        syncNavigationCollapseForViewport();
        collapsibleNavigationMediaQuery.addEventListener("change", syncNavigationCollapseForViewport);
        setAuthExpiredHandler(() => {
            endAuthenticatedSession("Session expired. Please sign in again.", true);
        });
        await checkApi();
        await restoreOpenIdCallback();

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
