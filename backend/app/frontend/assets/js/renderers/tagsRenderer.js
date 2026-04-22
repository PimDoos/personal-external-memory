import { clearNodeChildren, createButtonNode, createFormDataObject, createNode } from "../dom.js";

export function createTagsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function buildTagEditForm(tag) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const nameInput = createNode("input", {
            value: tag.name || "",
            attrs: { name: "name", required: true },
        });
        const descriptionInput = createNode("input", {
            value: tag.description || "",
            attrs: { name: "description" },
        });
        const colorInput = createNode("input", {
            value: tag.color || "#b86a37",
            attrs: { name: "color", type: "color" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Name" }), nameInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Description" }), descriptionInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Color" }), colorInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.description === "") {
                delete payload.description;
            }
            await actions.updateTag(tag.id, payload);
        });

        return form;
    }

    function renderTagDetail() {
        const panel = document.getElementById("tag-detail-panel");
        const form = document.getElementById("tag-form");
        const container = document.getElementById("tag-detail");
        const mode = state.sidebar.tags;

        if (mode === "hidden") {
            panel.classList.add("hidden");
            form.classList.add("hidden");
            container.classList.add("hidden");
            return;
        }

        panel.classList.remove("hidden");
        if (mode === "create") {
            form.classList.remove("hidden");
            container.classList.add("hidden");
            return;
        }

        form.classList.add("hidden");
        container.classList.remove("hidden");

        const tag = state.data.tags.find((entry) => entry.id === state.selected.tagId);
        if (!tag) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";
        container.appendChild(createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Tag Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deleteTag(tag.id);
                        }),
                    ],
                }),
                buildTagEditForm(tag),
            ],
        }));
    }

    function renderTags() {
        const tags = filtered(
            "tags",
            state.data.tags,
            (tag) => tag.name,
            (tag) => tag.description
        );

        const listNode = document.getElementById("tags-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            tags,
            (tag) => {
                const item = createListItem(tag.name, tag.description || "No description");
                if (tag.color) {
                    item.style.borderColor = tag.color;
                    item.style.backgroundColor = `${tag.color}1f`;
                }
                if (state.selected.tagId === tag.id) {
                    item.classList.add("active");
                }
                item.addEventListener("click", async () => {
                    await actions.selectTag(tag.id);
                });
                return item;
            },
            "No tags yet."
        );

        renderTagDetail();
    }

    return { renderTags, renderTagDetail };
}
