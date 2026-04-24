export const state = {
    token: window.localStorage.getItem("pem.accessToken") || "",
    refreshToken: window.localStorage.getItem("pem.refreshToken") || "",
    email: window.localStorage.getItem("pem.userEmail") || "",
    activeSection: "dashboard",
    filters: {
        people: "",
        circles: "",
        brands: "",
        events: "",
        tags: "",
        types: "",
    },
    selected: {
        personId: null,
        circleId: null,
        brandId: null,
        eventId: null,
        tagId: null,
    },
    topologyFilters: {
        relationshipType: "",
        socialCircleId: "",
        brandId: "",
        edgeVisibility: {
            relationship: true,
            affiliation: true,
            membership: true,
        },
    },
    sidebar: {
        people: "hidden",
        circles: "hidden",
        brands: "hidden",
        events: "hidden",
        tags: "hidden",
    },
    data: {
        people: [],
        circles: [],
        brands: [],
        events: [],
        tags: [],
        typeLists: {
            contactInfoTypes: [],
            relationshipTypes: [],
            socialCircleTypes: [],
            eventTypes: [],
            eventParticipantRoleTypes: [],
            brandMembershipTypes: [],
        },
    },
};

export function saveSession(token, email, refreshToken = "") {
    state.token = token;
    state.refreshToken = refreshToken || state.refreshToken || "";
    state.email = email;
    window.localStorage.setItem("pem.accessToken", token);
    window.localStorage.setItem("pem.userEmail", email);
    if (state.refreshToken) {
        window.localStorage.setItem("pem.refreshToken", state.refreshToken);
    } else {
        window.localStorage.removeItem("pem.refreshToken");
    }
}

export function clearSession() {
    state.token = "";
    state.refreshToken = "";
    state.email = "";
    state.selected.personId = null;
    state.selected.circleId = null;
    state.selected.brandId = null;
    state.selected.eventId = null;
    state.selected.tagId = null;
    Object.keys(state.sidebar).forEach((section) => {
        state.sidebar[section] = "hidden";
    });
    window.localStorage.removeItem("pem.accessToken");
    window.localStorage.removeItem("pem.refreshToken");
    window.localStorage.removeItem("pem.userEmail");
}