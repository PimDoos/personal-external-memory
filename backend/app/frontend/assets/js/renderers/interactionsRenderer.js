import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { formatDateTime, toLocalDateTimeInputValue, toIsoDateTime } from "../ui.js";

export function createInteractionsRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedInteraction, createListItem, renderSimpleList } = common;

    function buildInteractionEditForm(interaction) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const titleInput = createNode("input", {
            value: interaction.title || "",
            attrs: { name: "title", placeholder: "Weekly check-in, coffee chat" },
        });
        const interactionTypes = state.data.typeLists.interactionTypes || [];
        const interactionTypeSelect = createSelectNode(
            [{ value: "", label: "No type" }, ...interactionTypes.map((entry) => ({ value: entry.name, label: entry.name }))],
            interaction.interaction_type || "",
            { name: "interaction_type" }
        );
        const startInput = createNode("input", {
            value: toLocalDateTimeInputValue(interaction.start_time),
            attrs: { name: "start_time", type: "datetime-local" },
        });
        const endInput = createNode("input", {
            value: toLocalDateTimeInputValue(interaction.end_time),
            attrs: { name: "end_time", type: "datetime-local" },
        });
        const mediumOptions = state.data.typeLists.interactionMediums || [];
        const mediumInput = createSelectNode(
            [{ value: "", label: "No medium" }, ...mediumOptions.map((entry) => ({ value: entry.name, label: entry.name }))],
            interaction.medium || "",
            { name: "medium" }
        );
        const locationInput = createNode("input", {
            value: interaction.location || "",
            attrs: { name: "location" },
        });
        const notesInput = createNode("textarea", {
            value: interaction.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Title" }), titleInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Type" }), interactionTypeSelect] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Start" }), startInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "End" }), endInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Medium" }), mediumInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Location" }), locationInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Notes" }), notesInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (eventObj) => {
            eventObj.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.start_time) {
                payload.start_time = toIsoDateTime(payload.start_time);
            } else {
                delete payload.start_time;
            }
            if (payload.end_time) {
                payload.end_time = toIsoDateTime(payload.end_time);
            } else {
                delete payload.end_time;
            }
            if (payload.title === "") {
                delete payload.title;
            }
            if (payload.interaction_type === "") {
                delete payload.interaction_type;
            }
            if (payload.medium === "") {
                delete payload.medium;
            }
            if (payload.location === "") {
                delete payload.location;
            }
            if (payload.notes === "") {
                delete payload.notes;
            }
            payload.date = payload.start_time || payload.end_time || interaction.date;
            await actions.updateInteraction(interaction.id, payload);
        });

        return form;
    }

    function renderInteractionDetail() {
        const panel = document.getElementById("interaction-detail-panel");
        const sidebarForm = document.getElementById("interaction-form");
        const container = document.getElementById("interaction-detail");
        const interaction = selectedInteraction();
        const mode = state.sidebar.interactions;

        if (mode === "hidden") {
            panel.classList.add("hidden");
            sidebarForm.classList.add("hidden");
            container.classList.add("hidden");
            return;
        }

        panel.classList.remove("hidden");
        const createTypeSelect = sidebarForm.querySelector("select[name='interaction_type']");
        if (createTypeSelect) {
            const selectedType = createTypeSelect.value;
            clearNodeChildren(createTypeSelect);
            createTypeSelect.appendChild(createNode("option", { text: "No type", attrs: { value: "" } }));
            (state.data.typeLists.interactionTypes || []).forEach((entry) => {
                createTypeSelect.appendChild(createNode("option", { text: entry.name, attrs: { value: entry.name } }));
            });
            createTypeSelect.value = selectedType;
        }

        const createMediumSelect = sidebarForm.querySelector("select[name='medium']");
        if (createMediumSelect) {
            const selectedMedium = createMediumSelect.value;
            clearNodeChildren(createMediumSelect);
            createMediumSelect.appendChild(createNode("option", { text: "No medium", attrs: { value: "" } }));
            (state.data.typeLists.interactionMediums || []).forEach((entry) => {
                createMediumSelect.appendChild(createNode("option", { text: entry.name, attrs: { value: entry.name } }));
            });
            createMediumSelect.value = selectedMedium;
        }

        if (mode === "create") {
            sidebarForm.classList.remove("hidden");
            container.classList.add("hidden");
            return;
        }

        sidebarForm.classList.add("hidden");
        container.classList.remove("hidden");

        if (!interaction) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";

        const participantIds = caches.interactionParticipants.get(interaction.id) || [];
        const participants = state.data.people.filter((person) => participantIds.includes(person.id));
        const availablePeople = state.data.people.filter((person) => !participantIds.includes(person.id));

        container.appendChild(createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Interaction Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deleteInteraction(interaction.id);
                        }),
                    ],
                }),
                buildInteractionEditForm(interaction),
                createNode("p", { className: "muted", text: formatDateTime(interaction.date) }),
            ],
        }));

        const section = createNode("section", { className: "subpanel" });
        const form = createNode("form", { className: "inline-form" });

        const options = availablePeople.length
            ? availablePeople.map((person) => ({ value: person.id, label: nameOfPerson(person.id) }))
            : [{ value: "", label: "No available people" }];

        const personSelect = createSelectNode(options, "", {
            name: "person_id",
            disabled: availablePeople.length ? undefined : true,
        });

        form.appendChild(personSelect);
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
            await actions.addInteractionParticipant(interaction.id, Number(values.person_id));
        });

        const { wrapper: formWrapper, trigger: formTrigger } = wrapCollapsible("+ Add", form);
        section.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Participants" }), formTrigger] }));
        section.appendChild(formWrapper);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            participants,
            (participant) => {
                const actionGroup = createNode("div", { className: "list-actions" });
                actionGroup.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeInteractionParticipant(interaction.id, participant.id);
                }));
                const item = createListItem(nameOfPerson(participant.id), "", actionGroup);
                item.addEventListener("click", async () => {
                    await actions.openPersonFromContext(participant.id);
                });
                return item;
            },
            "No participants yet."
        );
        section.appendChild(list);
        container.appendChild(section);
    }

    function renderInteractions() {
        const interactions = filtered(
            "interactions",
            state.data.interactions,
            (item) => item.title,
            (item) => item.interaction_type,
            (item) => item.medium,
            (item) => item.location,
            (item) => item.notes
        );

        const listNode = document.getElementById("interactions-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            interactions,
            (interaction) => {
                const item = createListItem(interaction.title || interaction.medium || "Interaction", interaction.interaction_type || interaction.medium || formatDateTime(interaction.date));
                if (state.selected.interactionId === interaction.id) {
                    item.classList.add("active");
                }
                item.addEventListener("click", async () => {
                    await actions.selectInteraction(interaction.id);
                });
                return item;
            },
            "No interactions yet."
        );

        renderInteractionDetail();
    }

    return {
        renderInteractions,
        renderInteractionDetail,
    };
}
