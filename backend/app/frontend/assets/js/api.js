import { state } from "./state.js";

async function request(path, options = {}) {
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

function jsonBody(data) {
    return { body: JSON.stringify(data) };
}

export const api = {
    health: () => request("/api/health"),
    auth: {
        register: (data) => request("/api/auth/register", { method: "POST", ...jsonBody(data) }),
        login: (data) => request("/api/auth/login", { method: "POST", ...jsonBody(data) }),
    },
    people: {
        list: () => request("/api/people"),
        create: (data) => request("/api/people", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/people/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/people/${id}`, { method: "DELETE" }),
    },
    contactInfo: {
        listForPerson: (personId) => request(`/api/contact-info/people/${personId}`),
        create: (data) => request("/api/contact-info", { method: "POST", ...jsonBody(data) }),
        remove: (id) => request(`/api/contact-info/${id}`, { method: "DELETE" }),
    },
    tags: {
        list: () => request("/api/tags"),
        create: (data) => request("/api/tags", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/tags/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/tags/${id}`, { method: "DELETE" }),
        listForPerson: (personId) => request(`/api/tags/people/${personId}`),
        listPeopleWithTag: (tagId) => request(`/api/tags/${tagId}/people`),
        attachToPerson: (tagId, personId) => request(`/api/tags/${tagId}/people/${personId}`, { method: "POST" }),
        detachFromPerson: (tagId, personId) => request(`/api/tags/${tagId}/people/${personId}`, { method: "DELETE" }),
    },
    relationships: {
        list: () => request("/api/relationships"),
        listForPerson: (personId) => request(`/api/relationships/people/${personId}`),
        create: (data) => request("/api/relationships", { method: "POST", ...jsonBody(data) }),
        remove: (id) => request(`/api/relationships/${id}`, { method: "DELETE" }),
    },
    circles: {
        list: () => request("/api/social-circles"),
        create: (data) => request("/api/social-circles", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/social-circles/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/social-circles/${id}`, { method: "DELETE" }),
        members: (circleId) => request(`/api/associations/circle-members/${circleId}`),
        addMember: (data) => request("/api/associations/circle-members", { method: "POST", ...jsonBody(data) }),
        removeMember: (circleId, personId) => request(`/api/associations/circle-members/${circleId}/${personId}`, { method: "DELETE" }),
    },
    brands: {
        list: () => request("/api/brands"),
        create: (data) => request("/api/brands", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/brands/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/brands/${id}`, { method: "DELETE" }),
        members: (brandId) => request(`/api/associations/brand-members/${brandId}`),
        addMember: (data) => request("/api/associations/brand-members", { method: "POST", ...jsonBody(data) }),
        updateMemberType: (brandId, personId, type) => request(`/api/associations/brand-members/${brandId}/${personId}/type?type=${encodeURIComponent(type)}`, { method: "PUT" }),
        removeMember: (brandId, personId) => request(`/api/associations/brand-members/${brandId}/${personId}`, { method: "DELETE" }),
    },
    events: {
        list: () => request("/api/events"),
        create: (data) => request("/api/events", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/events/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/events/${id}`, { method: "DELETE" }),
        participants: (eventId) => request(`/api/associations/event-participants/${eventId}`),
        addParticipant: (data) => request("/api/associations/event-participants", { method: "POST", ...jsonBody(data) }),
        updateParticipantRole: (eventId, personId, role) => request(`/api/associations/event-participants/${eventId}/${personId}/role?role=${encodeURIComponent(role)}`, { method: "PUT" }),
        removeParticipant: (eventId, personId) => request(`/api/associations/event-participants/${eventId}/${personId}`, { method: "DELETE" }),
    },
    interactions: {
        list: () => request("/api/interactions"),
        create: (data) => request("/api/interactions", { method: "POST", ...jsonBody(data) }),
        update: (id, data) => request(`/api/interactions/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (id) => request(`/api/interactions/${id}`, { method: "DELETE" }),
        participants: (interactionId) => request(`/api/associations/interaction-participants/${interactionId}`),
        addParticipant: (data) => request("/api/associations/interaction-participants", { method: "POST", ...jsonBody(data) }),
        removeParticipant: (interactionId, personId) => request(`/api/associations/interaction-participants/${interactionId}/${personId}`, { method: "DELETE" }),
    },
    types: {
        list: (category) => request(`/api/types/${category}`),
        create: (category, data) => request(`/api/types/${category}`, { method: "POST", ...jsonBody(data) }),
        update: (category, id, data) => request(`/api/types/${category}/${id}`, { method: "PUT", ...jsonBody(data) }),
        remove: (category, id) => request(`/api/types/${category}/${id}`, { method: "DELETE" }),
    },
};