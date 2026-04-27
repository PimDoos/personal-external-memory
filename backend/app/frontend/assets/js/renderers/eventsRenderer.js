import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { formatDateTime, toLocalDateTimeInputValue, toIsoDateTime } from "../ui.js";
import { createCombobox } from "../combobox.js";
import { getAvatarInitials } from "../avatar.js";

export function createEventsRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedEvent, createListItem, renderSimpleList } = common;

    function displayEventLabel(event) {
        return event.title || `Event #${event.id}`;
    }

    function displayLocationLabel(location) {
        return location.label || location.location || "(unnamed location)";
    }

    function getLocationTypeOptions(currentValue = "") {
        const entries = state.data.typeLists.locationTypes || [];
        const options = entries.map((entry) => ({ value: entry.name, label: entry.name }));
        if (currentValue && !options.some((option) => option.value === currentValue)) {
            options.unshift({ value: currentValue, label: currentValue });
        }
        if (!options.length) {
            options.push({ value: "", label: "No location types" });
        }
        return options;
    }

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
        const form = createNode("form", { className: "form-grid compact-form event-form--detail" });
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
        const notesInput = createNode("textarea", {
            value: event.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", {
            className: "event-form__title",
            children: [createNode("span", { text: "Title" }), titleInput],
        }));
        form.appendChild(createNode("label", {
            className: "event-form__type",
            children: [createNode("span", { text: "Type" }), eventTypeSelect],
        }));
        form.appendChild(createNode("label", {
            className: "event-form__start",
            children: [createNode("span", { text: "Start" }), startInput],
        }));
        form.appendChild(createNode("label", {
            className: "event-form__end",
            children: [createNode("span", { text: "End" }), endInput],
        }));
        form.appendChild(createNode("label", {
            className: "event-form__notes",
            children: [createNode("span", { text: "Notes" }), notesInput],
        }));
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
            if (payload.notes === "") {
                payload.notes = null;
            }
            payload.date = payload.start_time || payload.end_time || event.date;
            await actions.updateEvent(event.id, payload);
        });

        return form;
    }

    function buildCreateLocationForm(eventId) {
        const form = createNode("form", { className: "stack compact-form" });
        const labelInput = createNode("input", {
            attrs: { name: "label", placeholder: "Optional label" },
        });
        const typeInput = createSelectNode(
            getLocationTypeOptions(),
            getLocationTypeOptions()[0]?.value || "",
            { name: "location_type", required: true, disabled: !(state.data.typeLists.locationTypes || []).length }
        );
        const locationInput = createNode("input", {
            attrs: { name: "location", required: true, placeholder: "Full address or coordinates" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Location" }), locationInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Type" }), typeInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Optional label" }), labelInput] }));
        form.appendChild(createButtonNode("Add location", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.label === "") {
                payload.label = null;
            }
            if (payload.location_type === "") {
                payload.location_type = null;
            }
            await actions.createLocationForEvent(eventId, payload);
            form.reset();
            typeInput.value = getLocationTypeOptions()[0]?.value || "";
        });

        return form;
    }

    function buildAssignLocationForm(eventId, assignedLocations) {
        const availableLocations = state.data.locations.filter(
            (location) => !assignedLocations.some((assigned) => assigned.id === location.id)
        );
        const options = availableLocations.length
            ? availableLocations.map((location) => ({
                value: location.id,
                label: location.location_type
                    ? `${displayLocationLabel(location)} (${location.location_type})`
                    : displayLocationLabel(location),
            }))
            : [{ value: "", label: "No available locations" }];

        const form = createNode("form", { className: "inline-form" });
        form.appendChild(createCombobox(options, "", {
            name: "location_id",
            placeholder: availableLocations.length ? "Search locations…" : "No available locations",
            disabled: !availableLocations.length,
        }));
        form.appendChild(createButtonNode("Assign", "primary-button", null, { type: "submit", disabled: !availableLocations.length }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.location_id) {
                return;
            }
            await actions.associateLocationToEvent(Number(payload.location_id), eventId);
        });

        return form;
    }

    function buildEventLocationsPanel(event) {
        const locations = caches.eventLocations.get(event.id) || [];
        const panel = createNode("section", { className: "subpanel" });
        const addUi = wrapCollapsible("+ Add", buildCreateLocationForm(event.id));
        const assignUi = wrapCollapsible("+ Assign", buildAssignLocationForm(event.id, locations));
        panel.appendChild(createNode("div", {
            className: "panel-heading",
            children: [
                createNode("h3", { text: "Locations" }),
                createNode("div", { className: "list-actions", children: [addUi.trigger, assignUi.trigger] }),
            ],
        }));
        panel.appendChild(addUi.wrapper);
        panel.appendChild(assignUi.wrapper);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            locations,
            (location) => {
                const subtitle = [location.location_type || "", location.location || ""].filter(Boolean).join(" · ");
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("click", (e) => e.stopPropagation());
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeLocationFromEvent(location.id, event.id);
                }));
                const item = createListItem(displayLocationLabel(location), subtitle, actionsNode);
                item.classList.add("clickable");
                item.addEventListener("click", async () => {
                    state.activeSection = "locations";
                    await actions.selectLocation(location.id);
                });
                return item;
            },
            "No locations yet."
        );
        panel.appendChild(list);
        return panel;
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
        container.appendChild(buildEventLocationsPanel(event));

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
        section.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Event" }), formTrigger] }));
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
                    className: "list-avatar",
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

        const circlesSection = createNode("section", { className: "subpanel" });
        const associatedCircles = caches.eventCircles.get(event.id) || [];
        const availableCircles = state.data.circles.filter(
            (circle) => !associatedCircles.some((assoc) => assoc.id === circle.id)
        );

        const circlesForm = createNode("form", { className: "inline-form" });
        const circleOptions = availableCircles.length
            ? availableCircles.map((circle) => ({ value: circle.id, label: circle.name }))
            : [{ value: "", label: "No available circles" }];

        const circleSelect = createSelectNode(circleOptions, "", {
            name: "circle_id",
            disabled: !availableCircles.length,
        });
        circlesForm.appendChild(circleSelect);
        circlesForm.appendChild(createButtonNode("Associate", "primary-button", null, {
            type: "submit",
            disabled: !availableCircles.length,
        }));

        circlesForm.addEventListener("submit", async (eventObj) => {
            eventObj.preventDefault();
            const values = createFormDataObject(circlesForm);
            if (!values.circle_id) return;
            await actions.associateCircleToEvent(Number(values.circle_id), event.id);
            circlesForm.reset();
        });

        const { wrapper: circleFormWrapper, trigger: circleFormTrigger } = wrapCollapsible("+ Associate", circlesForm);
        circlesSection.appendChild(
            createNode("div", {
                className: "panel-heading",
                children: [createNode("h3", { text: "Associated Circles" }), circleFormTrigger],
            })
        );
        circlesSection.appendChild(circleFormWrapper);

        const circlesList = createNode("div", { className: "list" });
        renderSimpleList(
            circlesList,
            associatedCircles,
            (circle) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeCircleFromEvent(circle.id, event.id);
                }));
                const item = createListItem(circle.name, circle.circle_type || "Social circle", actionsNode);
                bindEntityNavigation(item, "circles", circle.id, async () => {
                    state.activeSection = "circles";
                    await actions.selectCircle(circle.id);
                });
                return item;
            },
            "No associated circles."
        );
        circlesSection.appendChild(circlesList);
        container.appendChild(circlesSection);
    }

    function renderEvents() {
        const events = filtered(
            "events",
            state.data.events,
            (event) => event.title,
            (event) => event.event_type,
            (event) => event.notes
        ).sort((left, right) => getEventStartTimestamp(left) - getEventStartTimestamp(right));

        const listNode = document.getElementById("events-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            events,
            (event) => {
                const item = createListItem(displayEventLabel(event), formatDateTime(event.start_time || event.date));
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
