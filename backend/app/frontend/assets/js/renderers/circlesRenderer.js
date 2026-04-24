import { createButtonNode, clearNodeChildren, createNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";

export function createCirclesRenderer({ state, caches, actions, common }) {
    const { filtered, selectedCircle, createListItem, renderSimpleList } = common;

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
                delete payload.circle_type;
            }
            if (payload.description === "") {
                delete payload.description;
            }
            if (payload.notes === "") {
                delete payload.notes;
            }
            await actions.updateCircle(circle.id, payload);
        });

        return form;
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
                const item = createListItem(`${member.first_name} ${member.last_name || ""}`.trim(), "", actionsNode);
                bindEntityNavigation(item, "people", member.id, async () => {
                    await actions.openPersonFromContext(member.id);
                });
                return item;
            },
            "No members in this circle yet."
        );

        section.appendChild(list);
        container.appendChild(section);
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
