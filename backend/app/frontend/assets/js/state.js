export const state = {
    token: window.localStorage.getItem("pem.accessToken") || "",
    email: window.localStorage.getItem("pem.userEmail") || "",
    activeSection: "dashboard",
    filter: "",
    selected: {
        personId: null,
        circleId: null,
        brandId: null,
        eventId: null,
        interactionId: null,
        tagId: null,
    },
    sidebar: {
        people: "hidden",
        circles: "hidden",
        brands: "hidden",
        events: "hidden",
        interactions: "hidden",
        tags: "hidden",
    },
    data: {
        people: [],
        circles: [],
        brands: [],
        events: [],
        interactions: [],
        tags: [],
    },
};

export function saveSession(token, email) {
    state.token = token;
    state.email = email;
    window.localStorage.setItem("pem.accessToken", token);
    window.localStorage.setItem("pem.userEmail", email);
}

export function clearSession() {
    state.token = "";
    state.email = "";
    state.selected.personId = null;
    state.selected.circleId = null;
    state.selected.brandId = null;
    state.selected.eventId = null;
    state.selected.interactionId = null;
    state.selected.tagId = null;
    Object.keys(state.sidebar).forEach((section) => {
        state.sidebar[section] = "hidden";
    });
    window.localStorage.removeItem("pem.accessToken");
    window.localStorage.removeItem("pem.userEmail");
}