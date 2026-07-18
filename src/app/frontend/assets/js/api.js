import { saveSession, state } from "./state.js";

let authExpiredHandler = null;
let refreshPromise = null;
let authExpiredNotified = false;

function notifyAuthExpired() {
    if (authExpiredNotified) {
        return;
    }
    authExpiredNotified = true;
    if (typeof authExpiredHandler === "function") {
        authExpiredHandler();
    }
}

function shouldTryRefresh(path) {
    return !String(path || "").startsWith("/api/auth/");
}

export function setAuthExpiredHandler(handler) {
    authExpiredHandler = handler;
}

export async function refreshAccessToken() {
    if (!state.refreshToken) {
        return false;
    }

    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const response = await fetch("/api/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: state.refreshToken }),
            });

            if (!response.ok) {
                return false;
            }

            const tokens = await response.json();
            saveSession(
                tokens.access_token,
                state.email,
                tokens.refresh_token || state.refreshToken
            );
            authExpiredNotified = false;
            return true;
        } catch {
            return false;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

async function request(path, options = {}, authMeta = { retryAfterRefresh: true }) {
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(path, {
        ...options,
        headers,
    });

    if (response.status === 401 && authMeta.retryAfterRefresh && shouldTryRefresh(path)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            return request(path, options, { retryAfterRefresh: false });
        }
        notifyAuthExpired();
        const error = new Error("Session expired. Please sign in again.");
        error.code = "AUTH_EXPIRED";
        throw error;
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
        const detail = typeof payload === "object" && payload?.detail ? payload.detail : payload;
        throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail || "Request failed");
    }

    return payload;
}

async function requestBlob(path, options = {}, authMeta = { retryAfterRefresh: true }) {
    const headers = {
        ...(options.headers || {}),
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(path, {
        ...options,
        headers,
    });

    if (response.status === 401 && authMeta.retryAfterRefresh && shouldTryRefresh(path)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            return requestBlob(path, options, { retryAfterRefresh: false });
        }
        notifyAuthExpired();
        const error = new Error("Session expired. Please sign in again.");
        error.code = "AUTH_EXPIRED";
        throw error;
    }

    if (!response.ok) {
        const detailText = await response.text();
        throw new Error(detailText || "Request failed");
    }

    return response.blob();
}

function jsonBody(data) {
    return { body: JSON.stringify(data) };
}

export const api = {
    health: () => request("/api/health"),
    auth: {
        register: (data) => request("/api/auth/register", { method: "POST", ...jsonBody(data) }),
        login: (data) => request("/api/auth/login", { method: "POST", ...jsonBody(data) }),
        refresh: (data) => request("/api/auth/refresh", { method: "POST", ...jsonBody(data) }, { retryAfterRefresh: false }),
        openidConfig: () => request("/api/auth/openid/config", { method: "GET" }, { retryAfterRefresh: false }),
        openidLoginUrl: () => request("/api/auth/openid/login-url", { method: "GET" }, { retryAfterRefresh: false }),
        openidLinkUrl: () => request("/api/auth/openid/link-url", { method: "POST" }),
        openidUnlink: () => request("/api/auth/openid/link", { method: "DELETE" }),
    },
    people: {
        list: () => request("/api/people"),
        get: (id) => request(`/api/people/${id}`),
        create: (data) => request("/api/people", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/people/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/people/${id}`, { method: "DELETE" }),
    },
    contactInfo: {
        create: (data) => request("/api/contact-info", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/contact-info/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/contact-info/${id}`, { method: "DELETE" }),
    },
    tags: {
        list: () => request("/api/tags"),
        create: (data) => request("/api/tags", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/tags/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/tags/${id}`, { method: "DELETE" }),
        attachToPerson: (tagId, personId) => request(`/api/tags/${tagId}/people/${personId}`, { method: "POST" }),
        detachFromPerson: (tagId, personId) => request(`/api/tags/${tagId}/people/${personId}`, { method: "DELETE" }),
    },
    relationships: {
        list: () => request("/api/relationships"),
        create: (data) => request("/api/relationships", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/relationships/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/relationships/${id}`, { method: "DELETE" }),
    },
    circles: {
        list: () => request("/api/social-circles"),
        get: (id) => request(`/api/social-circles/${id}`),
        create: (data) => request("/api/social-circles", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/social-circles/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/social-circles/${id}`, { method: "DELETE" }),
        addMember: (data) => request("/api/associations/circle-members", { method: "POST", ...jsonBody(data) }),
        removeMember: (circleId, personId) => request(`/api/associations/circle-members/${circleId}/${personId}`, { method: "DELETE" }),
        associateEvent: (data) => request("/api/associations/circle-events", { method: "POST", ...jsonBody(data) }),
        removeEvent: (circleId, eventId) => request(`/api/associations/circle-events/${circleId}/${eventId}`, { method: "DELETE" }),
    },
    brands: {
        list: () => request("/api/brands"),
        get: (id) => request(`/api/brands/${id}`),
        create: (data) => request("/api/brands", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/brands/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/brands/${id}`, { method: "DELETE" }),
        addMember: (data) => request("/api/associations/brand-members", { method: "POST", ...jsonBody(data) }),
        updateMemberType: (brandId, personId, type) => request(`/api/associations/brand-members/${brandId}/${personId}/type?type=${encodeURIComponent(type)}`, { method: "PUT" }),
        removeMember: (brandId, personId) => request(`/api/associations/brand-members/${brandId}/${personId}`, { method: "DELETE" }),
    },
    events: {
        list: () => request("/api/events"),
        get: (id) => request(`/api/events/${id}`),
        create: (data) => request("/api/events", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/events/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/events/${id}`, { method: "DELETE" }),
        addParticipant: (data) => request("/api/associations/event-participants", { method: "POST", ...jsonBody(data) }),
        addParticipantsBulk: (data) => request("/api/associations/event-participants/bulk", { method: "POST", ...jsonBody(data) }),
        updateParticipantRole: (eventId, personId, role) => request(`/api/associations/event-participants/${eventId}/${personId}/role?role=${encodeURIComponent(role)}`, { method: "PUT" }),
        removeParticipant: (eventId, personId) => request(`/api/associations/event-participants/${eventId}/${personId}`, { method: "DELETE" }),
    },
    locations: {
        list: () => request("/api/locations"),
        get: (id) => request(`/api/locations/${id}`),
        create: (data) => request("/api/locations", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/locations/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/locations/${id}`, { method: "DELETE" }),
        associate: (locationId, entityType, entityId) => request(`/api/locations/${locationId}/associate/${entityType}/${entityId}`, { method: "POST" }),
        removeAssociation: (locationId, entityType, entityId) => request(`/api/locations/${locationId}/associate/${entityType}/${entityId}`, { method: "DELETE" }),
    },
    types: {
        list: (category) => request(`/api/types/${category}`),
        create: (category, data) => request(`/api/types/${category}`, { method: "POST", ...jsonBody(data) }),
        update: (category, id, data) => request(`/api/types/${category}/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (category, id) => request(`/api/types/${category}/${id}`, { method: "DELETE" }),
    },
    settings: {
        get: () => request("/api/user-settings"),
        update: (data) => request("/api/user-settings", { method: "PUT", ...jsonBody(data) }),
    },
    immich: {
        testConnection: () => request("/api/immich/test-connection", { method: "POST" }),
        syncFaces: () => request("/api/immich/sync-faces", { method: "POST" }),
        galleryForPerson: (personId, limit = 24) => request(`/api/immich/gallery/person/${personId}?limit=${Number(limit)}`),
        galleryForEvent: (eventId, limit = 24) => request(`/api/immich/gallery/event/${eventId}?limit=${Number(limit)}`),
        galleryForLocation: (locationId, limit = 24) => request(`/api/immich/gallery/location/${locationId}?limit=${Number(limit)}`),
        thumbnailBlob: (assetId, size = "preview") => requestBlob(
            `/api/immich/assets/${encodeURIComponent(String(assetId))}/thumbnail?size=${encodeURIComponent(String(size))}`
        ),
        proxyImageBlob: (path) => requestBlob(`/api/immich/proxy-image?path=${encodeURIComponent(String(path || ""))}`),
    },
    externalIdentities: {
        list: (skip = 0, limit = 1000) => request(`/api/external-identities?skip=${Number(skip)}&limit=${Number(limit)}`),
        listImmichPersonFaces: (personId = null) => {
            const query = personId ? `?person_id=${Number(personId)}` : "";
            return request(`/api/external-identities/immich/person-faces${query}`);
        },
        get: (id) => request(`/api/external-identities/${id}`),
        imageBlob: (id) => requestBlob(`/api/external-identities/${encodeURIComponent(String(id))}/image`),
        addAssociation: (externalIdentityId, data) => request(
            `/api/external-identities/${externalIdentityId}/associations`,
            { method: "POST", ...jsonBody(data) }
        ),
        removeAssociation: (externalIdentityId, associationId) => request(
            `/api/external-identities/${externalIdentityId}/associations/${associationId}`,
            { method: "DELETE" }
        ),
    },
};