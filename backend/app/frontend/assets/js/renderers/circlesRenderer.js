import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { createCombobox } from "../combobox.js";
import { getAvatarInitials } from "../avatar.js";

export function createCirclesRenderer({ state, caches, actions, common }) {
    const { filtered, selectedCircle, createEventCard, createListItem, renderSimpleList } = common;

    function displayEventLabel(event) {
        return event.title || `Event #${event.id}`;
    }

    function getEventStartTimestamp(event) {
        const timestamp = new Date(event.start_time || event.date || 0).getTime();
        return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
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

    function bindEntityNavigation(item, section, entityId, onPrimaryOpen) {
        item.addEventListener("click", async (event) => {
            if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                actions.openViewInNewTab(section, entityId);
                return;
            }
            await onPrimaryOpen();
        });

        item.addEventListener("auxclick", (event) => {
            if (event.button !== 1) {
                return;
            }
            event.preventDefault();
            actions.openViewInNewTab(section, entityId);
        });
    }

    function buildCircleEditForm(circle) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const nameInput = createNode("input", {
            value: circle.name || "",
            attrs: { name: "name", required: true },
        });
        const circleTypes = state.data.typeLists.socialCircleTypes || [];
        const circleTypeSelect = createSelectNode(
            [{ value: "", label: "No type" }, ...circleTypes.map((entry) => ({ value: entry.name, label: entry.name }))],
            circle.circle_type || "",
            { name: "circle_type" }
        );
        const descriptionInput = createNode("input", {
            value: circle.description || "",
            attrs: { name: "description" },
        });
        const notesInput = createNode("textarea", {
            value: circle.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Name" }), nameInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Type" }), circleTypeSelect] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Description" }), descriptionInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Notes" }), notesInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.circle_type === "") {
                payload.circle_type = null;
            }
            if (payload.description === "") {
                payload.description = null;
            }
            if (payload.notes === "") {
                payload.notes = null;
            }
            await actions.updateCircle(circle.id, payload);
        });

        return form;
    }

    function buildCreateLocationForm(circleId) {
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
            await actions.createLocationForCircle(circleId, payload);
            form.reset();
            typeInput.value = getLocationTypeOptions()[0]?.value || "";
        });

        return form;
    }

    function buildAssignLocationForm(circleId, assignedLocations) {
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
            await actions.associateLocationToCircle(Number(payload.location_id), circleId);
        });

        return form;
    }

    function buildCircleLocationsPanel(circle) {
        const locations = caches.circleLocations.get(circle.id) || [];
        const panel = createNode("section", { className: "subpanel" });
        const addUi = wrapCollapsible("+ Add", buildCreateLocationForm(circle.id));
        const assignUi = wrapCollapsible("+ Assign", buildAssignLocationForm(circle.id, locations));
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
                    await actions.removeLocationFromCircle(location.id, circle.id);
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

    function renderCircleDetail() {
        const panel = document.getElementById("circle-detail-panel");
        const formNode = document.getElementById("circle-form");
        const container = document.getElementById("circle-detail");
        const circle = selectedCircle();
        const mode = state.sidebar.circles;

        if (mode === "hidden") {
            panel.classList.add("hidden");
            formNode.classList.add("hidden");
            container.classList.add("hidden");
            return;
        }

        panel.classList.remove("hidden");
        const createTypeSelect = formNode.querySelector("select[name='circle_type']");
        if (createTypeSelect) {
            const selectedValue = createTypeSelect.value;
            clearNodeChildren(createTypeSelect);
            createTypeSelect.appendChild(createNode("option", { text: "No type", attrs: { value: "" } }));
            (state.data.typeLists.socialCircleTypes || []).forEach((entry) => {
                createTypeSelect.appendChild(createNode("option", { text: entry.name, attrs: { value: entry.name } }));
            });
            createTypeSelect.value = selectedValue;
        }

        if (mode === "create") {
            formNode.classList.remove("hidden");
            container.classList.add("hidden");
            return;
        }

        formNode.classList.add("hidden");
        container.classList.remove("hidden");

        if (!circle) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";

        const memberIds = caches.circleMembers.get(circle.id) || [];
        const members = state.data.people.filter((person) => memberIds.includes(person.id));
        const availablePeople = state.data.people
            .filter((person) => !memberIds.includes(person.id))
            .sort(comparePeopleByFirstName);

        container.appendChild(createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Circle Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deleteCircle(circle.id);
                        }),
                    ],
                }),
                buildCircleEditForm(circle),
            ],
        }));
        container.appendChild(buildCircleLocationsPanel(circle));

        const section = createNode("section", { className: "subpanel" });
        const form = createNode("form", { className: "inline-form" });

        const options = availablePeople.map((person) => ({ value: person.id, label: `${person.first_name} ${person.last_name || ""}`.trim() }));

        const selectNode = createCombobox(options, "", {
            name: "person_id",
            placeholder: availablePeople.length ? "Search people…" : "No available people",
            disabled: !availablePeople.length,
        });

        form.appendChild(selectNode);
        form.appendChild(createButtonNode("Add member", "primary-button", null, {
            type: "submit",
            disabled: !availablePeople.length,
        }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = createFormDataObject(form);
            if (!values.person_id) {
                return;
            }
            await actions.addCircleMember(circle.id, Number(values.person_id));
        });

        const { wrapper: formWrapper, trigger: formTrigger } = wrapCollapsible("+ Add", form);
        section.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Members" }), formTrigger] }));
        section.appendChild(formWrapper);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            members,
            (member) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeCircleMember(circle.id, member.id);
                }));
                const memberName = `${member.first_name} ${member.last_name || ""}`.trim();
                const avatar = createNode("span", {
                    className: "list-avatar list-avatar--person",
                    text: getAvatarInitials(memberName),
                    attrs: { title: memberName, "aria-label": memberName },
                });
                const item = createListItem(memberName, "", actionsNode, avatar);
                bindEntityNavigation(item, "people", member.id, async () => {
                    await actions.openPersonFromContext(member.id);
                });
                return item;
            },
            "No members in this circle yet."
        );

        section.appendChild(list);
        container.appendChild(section);

        const circleEventsSection = createNode("section", { className: "subpanel" });
        circleEventsSection.appendChild(createNode("div", {
            className: "panel-heading",
            children: [createNode("h3", { text: "Events" })],
        }));

        const eventList = createNode("div", { className: "list" });
        const associatedEvents = (caches.circleEvents.get(circle.id) || [])
            .slice()
            .sort((left, right) => getEventStartTimestamp(left) - getEventStartTimestamp(right));

        renderSimpleList(
            eventList,
            associatedEvents,
            (event) => {
                const item = createEventCard(event);
                bindEntityNavigation(item, "events", event.id, async () => {
                    state.activeSection = "events";
                    await actions.selectEvent(event.id);
                });
                return item;
            },
            "No associated events yet."
        );

        circleEventsSection.appendChild(eventList);
        container.appendChild(circleEventsSection);
    }

    function renderCircles() {
        const circles = filtered(
            "circles",
            state.data.circles,
            (circle) => circle.name,
            (circle) => circle.circle_type,
            (circle) => circle.description,
            (circle) => circle.notes
        );

        const listNode = document.getElementById("circles-list");
        clearNodeChildren(listNode);

        if (!circles.length) {
            listNode.appendChild(createNode("div", { className: "empty-state", text: "No circles created yet." }));
        } else {
            circles.forEach((circle) => {
                const item = createListItem(
                    circle.name,
                    circle.circle_type || circle.description || circle.notes || "No description"
                );

                if (state.selected.circleId === circle.id) {
                    item.classList.add("active");
                }

                bindEntityNavigation(item, "circles", circle.id, async () => {
                    await actions.selectCircle(circle.id);
                });

                listNode.appendChild(item);
            });
        }

        renderCircleDetail();
    }

    return {
        renderCircles,
        renderCircleDetail,
    };
}
