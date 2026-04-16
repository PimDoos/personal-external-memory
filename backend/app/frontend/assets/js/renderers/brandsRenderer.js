import { clearNodeChildren, createButtonNode, createNode } from "../dom.js";

export function createBrandsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function renderBrands() {
        const brands = filtered(
            state.data.brands,
            (brand) => brand.name,
            (brand) => brand.description,
            (brand) => brand.notes
        );

        const listNode = document.getElementById("brands-list");
        clearNodeChildren(listNode);

        renderSimpleList(
            listNode,
            brands,
            (brand) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteBrand(brand.id);
                }));
                return createListItem(
                    brand.name,
                    brand.description || brand.notes || "No description",
                    actionsNode
                );
            },
            "No brands created yet."
        );
    }

    return { renderBrands };
}
