import { clearNodeChildren, createButtonNode, createNode } from "../dom.js";

export function createTagsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

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
                return createListItem(tag.name, tag.description || "No description", actionGroup);
            },
            "No tags yet."
        );
    }

    return { renderTags };
}
