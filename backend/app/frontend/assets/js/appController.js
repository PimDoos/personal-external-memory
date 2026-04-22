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
    };

    const caches = {
        personContacts: new Map(),
        personTags: new Map(),
        peopleTagSummaries: new Map(),
        personRelationships: new Map(),
        personAssociations: new Map(),
        circleMembers: new Map(),
        brandMembers: new Map(),
        eventParticipants: new Map(),
        interactionParticipants: new Map(),
        topology: {
            relationships: [],
            circleMembersByCircleId: new Map(),
            brandMembersByBrandId: new Map(),
            eventParticipantsByEventId: new Map(),
            interactionParticipantsByInteractionId: new Map(),
            personBrandAffiliations: new Map(),
        },
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

    async function refreshSelectedEntityCaches() {
        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
        }
        if (state.selected.circleId) {
            await loadCircleMembers(state.selected.circleId);
        }
        if (state.selected.brandId) {
            await loadBrandMembers(state.selected.brandId);
        }
        if (state.selected.eventId) {
            await loadEventParticipants(state.selected.eventId);
        }
        if (state.selected.interactionId) {
            await loadInteractionParticipants(state.selected.interactionId);
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
        const [people, circles, brands, events, interactions, tags, contactInfoTypes, relationshipTypes, socialCircleTypes, eventTypes, interactionTypes, interactionMediums, brandMembershipTypes] = await Promise.all([
            api.people.list(),
            api.circles.list(),
            api.brands.list(),
            api.events.list(),
            api.interactions.list(),
            api.tags.list(),
            api.types.list("contact-info"),
            api.types.list("relationship"),
            api.types.list("social-circle"),
            api.types.list("event"),
            api.types.list("interaction"),
            api.types.list("interaction-medium"),
            api.types.list("brand-membership"),
        ]);

        state.data.people = people;
        state.data.circles = circles;
        state.data.brands = brands;
        state.data.events = events;
        state.data.interactions = interactions;
        state.data.tags = tags;
        state.data.typeLists = {
            contactInfoTypes,
            relationshipTypes,
            socialCircleTypes,
            eventTypes,
            interactionTypes,
            interactionMediums,
            brandMembershipTypes,
        };

        await refreshTopologyData();
    }

    async function refreshTopologyData() {
        const [relationships, circleMembersLists, brandMembersLists, eventParticipantsLists, interactionParticipantsLists] = await Promise.all([
            api.relationships.list(),
            Promise.all(state.data.circles.map((circle) => api.circles.members(circle.id))),
            Promise.all(state.data.brands.map((brand) => api.brands.members(brand.id))),
            Promise.all(state.data.events.map((event) => api.events.participants(event.id))),
            Promise.all(state.data.interactions.map((interaction) => api.interactions.participants(interaction.id))),
        ]);

        const circleMembersByCircleId = new Map(
            state.data.circles.map((circle, index) => [circle.id, circleMembersLists[index] || []])
        );
        const brandMembersByBrandId = new Map(
            state.data.brands.map((brand, index) => [brand.id, brandMembersLists[index] || []])
        );
        const eventParticipantsByEventId = new Map(
            state.data.events.map((event, index) => [event.id, eventParticipantsLists[index] || []])
        );
        const interactionParticipantsByInteractionId = new Map(
            state.data.interactions.map((interaction, index) => [interaction.id, interactionParticipantsLists[index] || []])
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

        // Add heuristic brand affiliations from events/interactions
        state.data.brands.forEach((brand) => {
            const needle = String(brand.name || "").toLowerCase().trim();
            if (!needle) {
                return;
            }

            state.data.events.forEach((event) => {
                const matchesBrand = [event.title, event.location, event.notes]
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

            state.data.interactions.forEach((interaction) => {
                const matchesBrand = [interaction.title, interaction.location, interaction.medium, interaction.notes]
                    .some((value) => String(value || "").toLowerCase().includes(needle));
                if (!matchesBrand) {
                    return;
                }

                (interactionParticipantsByInteractionId.get(interaction.id) || []).forEach((personId) => {
                    const personSet = personBrandAffiliations.get(personId);
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
            interactionParticipantsByInteractionId,
            personBrandAffiliations,
        };
    }

    async function loadPeopleTagSummaries() {
        const peopleTagSummaries = new Map(state.data.people.map((person) => [person.id, []]));
        const peopleIdsByTag = await Promise.all(
            state.data.tags.map((tag) => api.tags.listPeopleWithTag(tag.id))
        );

        state.data.tags.forEach((tag, index) => {
            const personIds = peopleIdsByTag[index] || [];
            personIds.forEach((personId) => {
                if (!peopleTagSummaries.has(personId)) {
                    peopleTagSummaries.set(personId, []);
                }
                peopleTagSummaries.get(personId).push(tag);
            });
        });

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
        const [contacts, tags, relationships] = await Promise.all([
            api.contactInfo.listForPerson(personId),
            api.tags.listForPerson(personId),
            api.relationships.listForPerson(personId),
        ]);

        caches.personContacts.set(personId, contacts);
        caches.personTags.set(personId, tags);
        caches.personRelationships.set(personId, relationships);

        const [circleMembersLists, eventParticipantLists, interactionParticipantLists, brandMembersLists] = await Promise.all([
            Promise.all(state.data.circles.map((circle) => api.circles.members(circle.id))),
            Promise.all(state.data.events.map((event) => api.events.participants(event.id))),
            Promise.all(state.data.interactions.map((interaction) => api.interactions.participants(interaction.id))),
            Promise.all(state.data.brands.map((brand) => api.brands.members(brand.id))),
        ]);

        const circleIds = state.data.circles
            .filter((circle, index) => circleMembersLists[index].includes(personId))
            .map((circle) => circle.id);

        const eventIds = state.data.events
            .filter((event, index) => eventParticipantLists[index].some((participant) => participant.person_id === personId))
            .map((event) => event.id);

        const interactionIds = state.data.interactions
            .filter((interaction, index) => interactionParticipantLists[index].includes(personId))
            .map((interaction) => interaction.id);

        // Explicit brand associations for this person
        const explicitBrandIds = state.data.brands
            .filter((brand, index) => (brandMembersLists[index] || []).some((m) => (m.person_id || m) === personId))
            .map((brand) => brand.id);

        // Heuristic affiliations from event/interaction context
        const associatedEvents = state.data.events.filter((event) => eventIds.includes(event.id));
        const associatedInteractions = state.data.interactions.filter((interaction) => interactionIds.includes(interaction.id));
        const heuristicBrandIds = state.data.brands
            .filter((brand) => {
                const needle = brand.name.toLowerCase();
                return associatedEvents.some((event) => String(event.location || "").toLowerCase().includes(needle))
                    || associatedInteractions.some((interaction) => {
                        return String(interaction.location || "").toLowerCase().includes(needle)
                            || String(interaction.medium || "").toLowerCase().includes(needle)
                            || String(interaction.notes || "").toLowerCase().includes(needle);
                    });
            })
            .map((brand) => brand.id);

        const brandIds = [...new Set([...explicitBrandIds, ...heuristicBrandIds])];

        caches.personAssociations.set(personId, {
            circleIds,
            eventIds,
            interactionIds,
            brandIds,
            explicitBrandIds,
        });
    }

    async function loadCircleMembers(circleId) {
        caches.circleMembers.set(circleId, await api.circles.members(circleId));
    }

    async function loadBrandMembers(brandId) {
        caches.brandMembers.set(brandId, await api.brands.members(brandId));
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
        await loadPeopleTagSummaries();

        if (state.selected.personId) {
            await loadPersonCaches(state.selected.personId);
        }
        if (state.selected.circleId) {
            await loadCircleMembers(state.selected.circleId);
        }
        if (state.selected.brandId) {
            await loadBrandMembers(state.selected.brandId);
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
            caches.personAssociations.clear();
            caches.circleMembers.clear();
            caches.eventParticipants.clear();
            caches.interactionParticipants.clear();
            renderer.renderAll();
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

                await createAndSelect({
                    section: "people",
                    selectedKey: "personId",
                    collectionKey: "people",
                    createRequest: (data) => api.people.create(data),
                    payload,
                    matcher: (person) => person.first_name === payload.first_name
                        && (person.last_name || "") === (payload.last_name || "")
                        && (person.birth_date || null) === (payload.birth_date || null)
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
                const payload = optionalFields(createFormDataObject(formNode), ["title", "event_type", "start_time", "end_time", "location", "notes"]);
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
                        && (entry.location || "") === (payload.location || "")
                        && (entry.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Event created.");
            });
        });

        getNodeById("interaction-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const formNode = event.currentTarget;
            await withAction(async () => {
                const payload = optionalFields(createFormDataObject(formNode), ["title", "interaction_type", "start_time", "end_time", "medium", "location", "notes"]);
                if (payload.start_time) {
                    payload.start_time = toIsoDateTime(payload.start_time);
                }
                if (payload.end_time) {
                    payload.end_time = toIsoDateTime(payload.end_time);
                }
                payload.date = payload.start_time || payload.end_time || new Date().toISOString();
                await createAndSelect({
                    section: "interactions",
                    selectedKey: "interactionId",
                    collectionKey: "interactions",
                    createRequest: (data) => api.interactions.create(data),
                    payload,
                    matcher: (entry) => (entry.title || "") === (payload.title || "")
                        && (entry.interaction_type || "") === (payload.interaction_type || "")
                        && entry.date === payload.date
                        && (entry.start_time || null) === (payload.start_time || null)
                        && (entry.end_time || null) === (payload.end_time || null)
                        && (entry.medium || "") === (payload.medium || "")
                        && (entry.location || "") === (payload.location || "")
                        && (entry.notes || "") === (payload.notes || ""),
                });
                formNode.reset();
                showToast("Interaction created.");
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
            await loadCircleMembers(circleId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Circle updated.");
        }),
        selectBrand: async (brandId) => withAction(async () => {
            state.selected.brandId = brandId;
            state.sidebar.brands = "detail";
            await loadBrandMembers(brandId);
        }),
        updateBrand: async (brandId, payload) => withAction(async () => {
            await api.brands.update(brandId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
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
            await loadEventParticipants(eventId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Event updated.");
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
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Participant added.");
        }),
        removeInteractionParticipant: async (interactionId, personId) => withAction(async () => {
            await api.interactions.removeParticipant(interactionId, personId);
            await loadInteractionParticipants(interactionId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            await refreshTopologyData();
            showToast("Participant removed.");
        }),
        updateInteraction: async (interactionId, payload) => withAction(async () => {
            await api.interactions.update(interactionId, payload);
            await refreshBaseData();
            await loadPeopleTagSummaries();
            await loadInteractionParticipants(interactionId);
            if (state.selected.personId) {
                await loadPersonCaches(state.selected.personId);
            }
            showToast("Interaction updated.");
        }),
        selectTag: async (tagId) => withAction(async () => {
            state.selected.tagId = tagId;
            state.sidebar.tags = "detail";
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
