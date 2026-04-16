import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject } from "../dom.js";

export function createCirclesRenderer({ state, caches, actions, common }) {
    const { filtered, selectedCircle, createListItem, renderSimpleList } = common;

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
        const availablePeople = state.data.people.filter((person) => !memberIds.includes(person.id));

        container.appendChild(createNode("article", {
            children: [
                createNode("h3", { text: circle.name }),
                createNode("p", { text: circle.description || circle.notes || "No notes yet." }),
            ],
        }));

        const section = createNode("section", { className: "subpanel" });
        const form = createNode("form", { className: "inline-form" });

        const options = availablePeople.length
            ? availablePeople.map((person) => ({ value: person.id, label: `${person.first_name} ${person.last_name || ""}`.trim() }))
            : [{ value: "", label: "No available people" }];

        const selectNode = createSelectNode(options, "", {
            name: "person_id",
            disabled: availablePeople.length ? undefined : true,
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

        section.appendChild(form);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            members,
            (member) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeCircleMember(circle.id, member.id);
                }));
                return createListItem(`${member.first_name} ${member.last_name || ""}`.trim(), "", actionsNode);
            },
            "No members in this circle yet."
        );

        section.appendChild(list);
        container.appendChild(section);
    }

    function renderCircles() {
        const circles = filtered(
            state.data.circles,
            (circle) => circle.name,
            (circle) => circle.description,
            (circle) => circle.notes
        );

        const listNode = document.getElementById("circles-list");
        clearNodeChildren(listNode);

        if (!circles.length) {
            listNode.appendChild(createNode("div", { className: "empty-state", text: "No circles created yet." }));
        } else {
            circles.forEach((circle) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteCircle(circle.id);
                }));

                const item = createListItem(
                    circle.name,
                    circle.description || circle.notes || "No description",
                    actionsNode
                );

                if (state.selected.circleId === circle.id) {
                    item.classList.add("active");
                }

                item.addEventListener("click", async () => {
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
