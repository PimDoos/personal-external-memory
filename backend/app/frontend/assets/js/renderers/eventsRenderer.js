import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject } from "../dom.js";
import { formatDateTime } from "../ui.js";

export function createEventsRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedEvent, createListItem, renderSimpleList } = common;

    function renderEventDetail() {
        const container = document.getElementById("event-detail");
        const event = selectedEvent();

        clearNodeChildren(container);
        if (!event) {
            container.className = "empty-state";
            container.innerText = "Select an event to manage participants and roles.";
            return;
        }

        container.className = "detail-grid";

        const participants = caches.eventParticipants.get(event.id) || [];
        const participantIds = participants.map((participant) => participant.person_id);
        const availablePeople = state.data.people.filter((person) => !participantIds.includes(person.id));

        container.appendChild(createNode("article", {
            children: [
                createNode("h3", { text: event.location || "Event" }),
                createNode("p", { className: "muted", text: formatDateTime(event.date) }),
                createNode("p", { text: event.notes || "No notes yet." }),
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
        const roleInput = createNode("input", { attrs: { name: "role", placeholder: "host, guest, organizer" } });

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

        section.appendChild(form);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            participants,
            (participant) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Role", "secondary-button", async () => {
                    const nextRole = window.prompt("New role", participant.role || "guest");
                    if (nextRole) {
                        await actions.changeEventRole(event.id, participant.person_id, nextRole);
                    }
                }));
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeEventParticipant(event.id, participant.person_id);
                }));
                return createListItem(nameOfPerson(participant.person_id), participant.role || "No role", actionsNode);
            },
            "No participants yet."
        );
        section.appendChild(list);
        container.appendChild(section);
    }

    function renderEvents() {
        const events = filtered(
            state.data.events,
            (event) => event.location,
            (event) => event.notes
        );

        const listNode = document.getElementById("events-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            events,
            (event) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Open", "secondary-button", async () => {
                    await actions.selectEvent(event.id);
                }));
                actionsNode.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteEvent(event.id);
                }));

                const item = createListItem(event.location || "Event", formatDateTime(event.date), actionsNode);
                if (state.selected.eventId === event.id) {
                    item.classList.add("active");
                }
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
