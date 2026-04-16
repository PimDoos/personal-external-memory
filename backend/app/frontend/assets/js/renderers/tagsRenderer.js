import { clearNodeChildren, createButtonNode, createNode } from "../dom.js";

export function createTagsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

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
            children: [
                createNode("h3", { text: tag.name }),
                createNode("p", { className: "muted", text: tag.description || "No description" }),
            ],
        }));
    }

    function renderTags() {
        const tags = filtered(
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
                const actionGroup = createNode("div", { className: "list-actions" });
                actionGroup.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteTag(tag.id);
                }));
                const item = createListItem(tag.name, tag.description || "No description", actionGroup);
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
