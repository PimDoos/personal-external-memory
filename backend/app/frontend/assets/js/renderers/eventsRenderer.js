import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { formatDateTime, toLocalDateTimeInputValue, toIsoDateTime } from "../ui.js";
import { createCombobox } from "../combobox.js";
import { getAvatarInitials } from "../avatar.js";

export function createEventsRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedEvent, createListItem, renderSimpleList } = common;

    function comparePeopleByFirstName(left, right) {
        const firstNameDelta = String(left.first_name || "").localeCompare(String(right.first_name || ""), undefined, { sensitivity: "base" });
        if (firstNameDelta !== 0) {
            return firstNameDelta;
        }
        return String(left.last_name || "").localeCompare(String(right.last_name || ""), undefined, { sensitivity: "base" });
    }

    function getEventStartTimestamp(event) {
        return new Date(event.start_time || event.date || 0).getTime();
    }

    function bindEntityNavigation(item, section, entityId, onPrimaryOpen) {
        item.addEventListener("click", async (eventObj) => {
            if (eventObj.metaKey || eventObj.ctrlKey) {
                eventObj.preventDefault();
                actions.openViewInNewTab(section, entityId);
                return;
            }
            await onPrimaryOpen();
        });

        item.addEventListener("auxclick", (eventObj) => {
            if (eventObj.button !== 1) {
                return;
            }
            eventObj.preventDefault();
            actions.openViewInNewTab(section, entityId);
        });
    }

    function buildEventEditForm(event) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const titleInput = createNode("input", {
            value: event.title || "",
            attrs: { name: "title", placeholder: "Birthday dinner, launch party" },
        });
        const eventTypes = state.data.typeLists.eventTypes || [];
        const eventTypeSelect = createSelectNode(
            [{ value: "", label: "No type" }, ...eventTypes.map((entry) => ({ value: entry.name, label: entry.name }))],
            event.event_type || "",
            { name: "event_type" }
        );
        const startInput = createNode("input", {
            value: toLocalDateTimeInputValue(event.start_time),
            attrs: { name: "start_time", type: "datetime-local" },
        });
        const endInput = createNode("input", {
            value: toLocalDateTimeInputValue(event.end_time),
            attrs: { name: "end_time", type: "datetime-local" },
        });
        const locationInput = createNode("input", {
            value: event.location || "",
            attrs: { name: "location" },
        });
        const notesInput = createNode("textarea", {
            value: event.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Title" }), titleInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Type" }), eventTypeSelect] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Start" }), startInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "End" }), endInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Location" }), locationInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Notes" }), notesInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (eventObj) => {
            eventObj.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.start_time) {
                payload.start_time = toIsoDateTime(payload.start_time);
            } else {
                payload.start_time = null;
            }
            if (payload.end_time) {
                payload.end_time = toIsoDateTime(payload.end_time);
            } else {
                payload.end_time = null;
            }
            if (payload.title === "") {
                payload.title = null;
            }
            if (payload.event_type === "") {
                payload.event_type = null;
            }
            if (payload.location === "") {
                payload.location = null;
            }
            if (payload.notes === "") {
                payload.notes = null;
            }
            payload.date = payload.start_time || payload.end_time || event.date;
            await actions.updateEvent(event.id, payload);
        });

        return form;
    }

    function renderEventDetail() {
        const panel = document.getElementById("event-detail-panel");
        const sidebarForm = document.getElementById("event-form");
        const container = document.getElementById("event-detail");
        const event = selectedEvent();
        const mode = state.sidebar.events;

        if (mode === "hidden") {
            panel.classList.add("hidden");
            sidebarForm.classList.add("hidden");
            container.classList.add("hidden");
            return;
        }

        panel.classList.remove("hidden");
        const createTypeSelect = sidebarForm.querySelector("select[name='event_type']");
        if (createTypeSelect) {
            const selectedValue = createTypeSelect.value;
            clearNodeChildren(createTypeSelect);
            createTypeSelect.appendChild(createNode("option", { text: "No type", attrs: { value: "" } }));
            (state.data.typeLists.eventTypes || []).forEach((entry) => {
                createTypeSelect.appendChild(createNode("option", { text: entry.name, attrs: { value: entry.name } }));
            });
            createTypeSelect.value = selectedValue;
        }

        if (mode === "create") {
            sidebarForm.classList.remove("hidden");
            container.classList.add("hidden");
            return;
        }

        sidebarForm.classList.add("hidden");
        container.classList.remove("hidden");

        if (!event) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";

        const participants = caches.eventParticipants.get(event.id) || [];
        const participantIds = participants.map((participant) => participant.person_id);
        const availablePeople = state.data.people
            .filter((person) => !participantIds.includes(person.id))
            .sort(comparePeopleByFirstName);

        container.appendChild(createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Event Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deleteEvent(event.id);
                        }),
                    ],
                }),
                buildEventEditForm(event),
                createNode("p", { className: "muted", text: formatDateTime(event.date) }),
            ],
        }));

        const section = createNode("section", { className: "subpanel" });
        const form = createNode("form", { className: "inline-form" });

        const options = availablePeople.map((person) => ({ value: person.id, label: nameOfPerson(person.id) }));

        const personSelect = createCombobox(options, "", {
            name: "person_id",
            placeholder: availablePeople.length ? "Search people…" : "No available people",
            disabled: !availablePeople.length,
        });
        const roleOptions = [{ value: "", label: "No role" }]
            .concat((state.data.typeLists.eventParticipantRoleTypes || []).map((entry) => ({ value: entry.name, label: entry.name })));
        const roleInput = createSelectNode(roleOptions, "", { name: "role" });

        form.appendChild(personSelect);
        form.appendChild(roleInput);
        form.appendChild(createButtonNode("Add participant", "primary-button", null, {
            type: "submit",
            disabled: !availablePeople.length,
        }));

        form.addEventListener("submit", async (eventObj) => {
            eventObj.preventDefault();
            const values = createFormDataObject(form);
            if (!values.person_id) {
                return;
            }
            await actions.addEventParticipant(event.id, Number(values.person_id), values.role || undefined);
            form.reset();
        });

        const { wrapper: formWrapper, trigger: formTrigger } = wrapCollapsible("+ Add", form);
        section.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Participants" }), formTrigger] }));
        section.appendChild(formWrapper);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            participants,
            (participant) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("mousedown", (eventObj) => {
                    eventObj.stopPropagation();
                });
                actionsNode.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });
                const roleSelectOptions = [{ value: "", label: "No role" }]
                    .concat((state.data.typeLists.eventParticipantRoleTypes || []).map((entry) => ({ value: entry.name, label: entry.name })));
                const roleSelect = createSelectNode(roleSelectOptions, participant.role || "", { name: "role" });
                roleSelect.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });
                const setRoleButton = createButtonNode("Set role", "secondary-button", async () => {
                    await actions.changeEventRole(event.id, participant.person_id, roleSelect.value || "");
                });
                actionsNode.appendChild(roleSelect);
                actionsNode.appendChild(setRoleButton);
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeEventParticipant(event.id, participant.person_id);
                }));
                const participantName = nameOfPerson(participant.person_id);
                const avatar = createNode("span", {
                    className: "list-avatar list-avatar--person",
                    text: getAvatarInitials(participantName),
                    attrs: { title: participantName, "aria-label": participantName },
                });
                const item = createListItem(participantName, participant.role || "No role", actionsNode, avatar);
                bindEntityNavigation(item, "people", participant.person_id, async () => {
                    await actions.openPersonFromContext(participant.person_id);
                });
                return item;
            },
            "No participants yet."
        );
        section.appendChild(list);
        container.appendChild(section);
    }

    function renderEvents() {
        const events = filtered(
            "events",
            state.data.events,
            (event) => event.title,
            (event) => event.event_type,
            (event) => event.location,
            (event) => event.notes
        ).sort((left, right) => getEventStartTimestamp(left) - getEventStartTimestamp(right));

        const listNode = document.getElementById("events-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            events,
            (event) => {
                const item = createListItem(event.title || event.location || "Event", formatDateTime(event.start_time || event.date));
                if (state.selected.eventId === event.id) {
                    item.classList.add("active");
                }
                bindEntityNavigation(item, "events", event.id, async () => {
                    await actions.selectEvent(event.id);
                });
                return item;
            },
            "No events yet."
        );

        renderEventDetail();
    }

    return {
        renderEvents,
        renderEventDetail,
    };
}
