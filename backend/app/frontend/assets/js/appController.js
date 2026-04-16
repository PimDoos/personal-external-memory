import { api } from "./api.js";
import { createFormDataObject, getNodeById } from "./dom.js";
import { createRenderer } from "./render.js";
import { clearSession, saveSession, state } from "./state.js";
import { toIsoDateTime } from "./ui.js";

export function createAppController() {
    const refs = {
        authPanel: getNodeById("auth-panel"),
        authMessage: getNodeById("auth-message"),
        contentPanel: getNodeById("content-panel"),
        navigationPanel: getNodeById("navigation-panel"),
        userEmail: getNodeById("user-email"),
        logoutButton: getNodeById("logout-button"),
        toast: getNodeById("toast"),
        apiStatus: getNodeById("api-status"),
        globalFilter: getNodeById("global-filter"),
    };

    const caches = {
        personContacts: new Map(),
        personTags: new Map(),
        personRelationships: new Map(),
        circleMembers: new Map(),
        eventParticipants: new Map(),
        interactionParticipants: new Map(),
    };

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
            case "interactions":
                state.selected.interactionId = null;
                break;
            case "tags":
                state.selected.tagId = null;
                break;
            default:
                break;
        }
    }

    function openCreateSidebar(section) {
        resetSidebar(section);
        state.sidebar[section] = "create";
        renderer.renderAll();
    }

    function setAuthMessage(message) {
        refs.authMessage.innerText = message;
    }

    function showToast(message, isError = false) {
        refs.toast.innerText = message;
        refs.toast.style.background = isError
            ? "rgba(98, 51, 45, 0.94)"
            : "rgba(27, 36, 34, 0.92)";
        refs.toast.classList.add("visible");
        window.clearTimeout(showToast.timeoutId);
        showToast.timeoutId = window.setTimeout(() => {
            refs.toast.classList.remove("visible");
        }, 2600);
    }

    function setApiStatus(message, healthy = true) {
        refs.apiStatus.innerText = message;
        refs.apiStatus.style.borderColor = healthy
            ? "rgba(127, 150, 127, 0.25)"
            : "rgba(98, 51, 45, 0.35)";
    }

    async function withAction(action, options = { render: true }) {
        try {
            await action();
            if (options.render) {
                renderer.renderAll();
            }
        } catch (error) {
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

    async function checkApi() {
        try {
            await api.health();
            setApiStatus("API ready", true);
        } catch {
            setApiStatus("API unavailable", false);
        }
    }

    async function refreshBaseData() {
        const [people, circles, brands, events, interactions, tags] = await Promise.all([
            api.people.list(),
            api.circles.list(),
            api.brands.list(),
            api.events.list(),
            api.interactions.list(),
            api.tags.list(),
        ]);

        state.data.people = people;
        state.data.circles = circles;
        state.data.brands = brands;
        state.data.events = events;
        state.data.interactions = interactions;
        state.data.tags = tags;
    }

    async function loadPersonCaches(personId) {
        const [contacts, tags, relationships] = await Promise.all([
            api.contactInfo.listForPerson(personId),
            api.tags.listForPerson(personId),
            api.relationships.listForPerson(personId),
        ]);

        caches.personContacts.set(personId, contacts);
        caches.personTags.set(personId, tags);
        caches.personRelationships.set(personId, relationships);
    }

    async function loadCircleMembers(circleId) {
        caches.circleMembers.set(circleId, await api.circles.members(circleId));
    }

    async function loadEventParticipants(eventId) {
        caches.eventParticipants.set(eventId, await api.events.participants(eventId));
    }

    async function loadInteractionParticipants(interactionId) {
        caches.interactionParticipants.set(
            interactionId,
            await api.interactions.participants(interactionId)
        );
    }

    async function bootstrapAuthenticated() {
        await refreshBaseData();

        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
        }
        if (state.selected.circleId) {
            await loadCircleMembers(state.selected.circleId);
        }
        if (state.selected.eventId) {
            await loadEventParticipants(state.selected.eventId);
        }
        if (state.selected.interactionId) {
            await loadInteractionParticipants(state.selected.interactionId);
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
                saveSession(tokens.access_token, payload.email);
                setAuthMessage("Signed in.");
                await bootstrapAuthenticated();
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
            clearSession();
            caches.personContacts.clear();
            caches.personTags.clear();
            caches.personRelationships.clear();
            caches.circleMembers.clear();
            caches.eventParticipants.clear();
            caches.interactionParticipants.clear();
            renderer.renderAll();
            showToast("Logged out.");
        });

        refs.globalFilter.addEventListener("input", (event) => {
            state.filter = event.target.value;
            renderer.renderAll();
        });

        document.querySelectorAll(".nav-button").forEach((button) => {
            button.addEventListener("click", () => {
                state.activeSection = button.dataset.section;
                if (state.sidebar[state.activeSection] !== undefined) {
                    resetSidebar(state.activeSection);
                }
                renderer.setAuthShell();
                renderer.renderAll();
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
            await withAction(async () => {
                const payload = createFormDataObject(event.currentTarget);
                optionalFields(payload, ["last_name", "notes"]);
                if (payload.birth_date) {
                    payload.birth_date = payload.birth_date;
                } else {
                    delete payload.birth_date;
                }

                const created = await api.people.create(payload);
                state.selected.personId = created.id;
                state.sidebar.people = "detail";
                event.currentTarget.reset();
                await bootstrapAuthenticated();
                showToast("Person created.");
            });
        });

        getNodeById("circle-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(event.currentTarget), ["description", "notes"]);
                const created = await api.circles.create(payload);
                state.selected.circleId = created.id;
                state.sidebar.circles = "detail";
                event.currentTarget.reset();
                await bootstrapAuthenticated();
                showToast("Circle created.");
            });
        });

        getNodeById("brand-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(event.currentTarget), ["description", "notes"]);
                const created = await api.brands.create(payload);
                state.selected.brandId = created.id;
                state.sidebar.brands = "detail";
                event.currentTarget.reset();
                await refreshBaseData();
                showToast("Brand created.");
            });
        });

        getNodeById("event-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(event.currentTarget), ["start_time", "end_time", "location", "notes"]);
                if (payload.start_time) {
                    payload.start_time = toIsoDateTime(payload.start_time);
                }
                if (payload.end_time) {
                    payload.end_time = toIsoDateTime(payload.end_time);
                }
                payload.date = payload.start_time || payload.end_time || new Date().toISOString();
                const created = await api.events.create(payload);
                state.selected.eventId = created.id;
                state.sidebar.events = "detail";
                event.currentTarget.reset();
                await bootstrapAuthenticated();
                showToast("Event created.");
            });
        });

        getNodeById("interaction-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(event.currentTarget), ["start_time", "end_time", "medium", "location", "notes"]);
                if (payload.start_time) {
                    payload.start_time = toIsoDateTime(payload.start_time);
                }
                if (payload.end_time) {
                    payload.end_time = toIsoDateTime(payload.end_time);
                }
                payload.date = payload.start_time || payload.end_time || new Date().toISOString();
                const created = await api.interactions.create(payload);
                state.selected.interactionId = created.id;
                state.sidebar.interactions = "detail";
                event.currentTarget.reset();
                await bootstrapAuthenticated();
                showToast("Interaction created.");
            });
        });

        getNodeById("tag-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(event.currentTarget), ["description"]);
                const created = await api.tags.create(payload);
                state.selected.tagId = created.id;
                state.sidebar.tags = "detail";
                event.currentTarget.reset();
                await refreshBaseData();
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
        removeContact: async (contactId, personId) => withAction(async () => {
            await api.contactInfo.remove(contactId);
            await loadPersonCaches(personId);
            showToast("Contact removed.");
        }),
        assignTagToPerson: async (tagId, personId) => withAction(async () => {
            await api.tags.attachToPerson(tagId, personId);
            await loadPersonCaches(personId);
            showToast("Tag assigned.");
        }),
        removeTagFromPerson: async (tagId, personId) => withAction(async () => {
            await api.tags.detachFromPerson(tagId, personId);
            await loadPersonCaches(personId);
            showToast("Tag removed.");
        }),
        addRelationship: async (payload) => withAction(async () => {
            await api.relationships.create(payload);
            await loadPersonCaches(payload.person_id_1);
            showToast("Relationship created.");
        }),
        deleteRelationship: async (relationshipId, personId) => withAction(async () => {
            await api.relationships.remove(relationshipId);
            await loadPersonCaches(personId);
            showToast("Relationship removed.");
        }),
        selectCircle: async (circleId) => withAction(async () => {
            state.selected.circleId = circleId;
            state.sidebar.circles = "detail";
            await loadCircleMembers(circleId);
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
            showToast("Member added.");
        }),
        removeCircleMember: async (circleId, personId) => withAction(async () => {
            await api.circles.removeMember(circleId, personId);
            await loadCircleMembers(circleId);
            showToast("Member removed.");
        }),
        selectBrand: async (brandId) => withAction(async () => {
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
        }),
        deleteBrand: async (brandId) => withAction(async () => {
            await api.brands.remove(brandId);
            if (state.selected.brandId === brandId) {
                resetSidebar("brands");
            }
            await refreshBaseData();
            showToast("Brand removed.");
        }),
        selectEvent: async (eventId) => withAction(async () => {
            state.selected.eventId = eventId;
            state.sidebar.events = "detail";
            await loadEventParticipants(eventId);
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
            showToast("Participant removed.");
        }),
        selectInteraction: async (interactionId) => withAction(async () => {
            state.selected.interactionId = interactionId;
            state.sidebar.interactions = "detail";
            await loadInteractionParticipants(interactionId);
        }),
        deleteInteraction: async (interactionId) => withAction(async () => {
            await api.interactions.remove(interactionId);
            if (state.selected.interactionId === interactionId) {
                resetSidebar("interactions");
            }
            await refreshBaseData();
            showToast("Interaction removed.");
        }),
        addInteractionParticipant: async (interactionId, personId) => withAction(async () => {
            await api.interactions.addParticipant({ interaction_id: interactionId, person_id: personId });
            await loadInteractionParticipants(interactionId);
            showToast("Participant added.");
        }),
        removeInteractionParticipant: async (interactionId, personId) => withAction(async () => {
            await api.interactions.removeParticipant(interactionId, personId);
            await loadInteractionParticipants(interactionId);
            showToast("Participant removed.");
        }),
        selectTag: async (tagId) => withAction(async () => {
            state.selected.tagId = tagId;
            state.sidebar.tags = "detail";
        }),
        deleteTag: async (tagId) => withAction(async () => {
            await api.tags.remove(tagId);
            if (state.selected.tagId === tagId) {
                resetSidebar("tags");
            }
            await refreshBaseData();
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Tag removed.");
        }),
    };

    const renderer = createRenderer({
        state,
        refs,
        caches,
        actions,
    });

    async function init() {
        bindStaticHandlers();
        await checkApi();

        if (state.token) {
            try {
                await bootstrapAuthenticated();
            } catch (error) {
                clearSession();
                renderer.renderAll();
                showToast(error.message || "Session restore failed", true);
            }
        } else {
            renderer.renderAll();
        }
    }

    return {
        init,
    };
}
