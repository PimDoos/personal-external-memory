export const state = {
    token: window.localStorage.getItem("pem.accessToken") || "",
    email: window.localStorage.getItem("pem.userEmail") || "",
    activeSection: "dashboard",
    filter: "",
    selected: {
        personId: null,
        circleId: null,
        eventId: null,
        interactionId: null,
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
    state.selected.eventId = null;
    state.selected.interactionId = null;
    window.localStorage.removeItem("pem.accessToken");
    window.localStorage.removeItem("pem.userEmail");
}