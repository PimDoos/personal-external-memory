import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject } from "../dom.js";
import { formatDateTime } from "../ui.js";

export function createInteractionsRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedInteraction, createListItem, renderSimpleList } = common;

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
            children: [
                createNode("h3", { text: interaction.medium || "Interaction" }),
                createNode("p", { className: "muted", text: formatDateTime(interaction.date) }),
                createNode("p", { text: interaction.location || interaction.notes || "No details yet." }),
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

        section.appendChild(form);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            participants,
            (participant) => {
                const actionGroup = createNode("div", { className: "list-actions" });
                actionGroup.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeInteractionParticipant(interaction.id, participant.id);
                }));
                return createListItem(nameOfPerson(participant.id), "", actionGroup);
            },
            "No participants yet."
        );
        section.appendChild(list);
        container.appendChild(section);
    }

    function renderInteractions() {
        const interactions = filtered(
            state.data.interactions,
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
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteInteraction(interaction.id);
                }));

                const item = createListItem(interaction.medium || "Interaction", formatDateTime(interaction.date), actionsNode);
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
