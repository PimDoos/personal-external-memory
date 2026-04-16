import { clearNodeChildren, createButtonNode, createNode } from "../dom.js";

export function createBrandsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function renderBrandDetail() {
        const panel = document.getElementById("brand-detail-panel");
        const form = document.getElementById("brand-form");
        const container = document.getElementById("brand-detail");
        const mode = state.sidebar.brands;

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

        const brand = state.data.brands.find((entry) => entry.id === state.selected.brandId);
        if (!brand) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";
        container.appendChild(createNode("article", {
            children: [
                createNode("h3", { text: brand.name }),
                createNode("p", { className: "muted", text: brand.description || "No description" }),
                createNode("p", { text: brand.notes || "No notes" }),
            ],
        }));
    }

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
                const item = createListItem(
                    brand.name,
                    brand.description || brand.notes || "No description",
                    actionsNode
                );
                if (state.selected.brandId === brand.id) {
                    item.classList.add("active");
                }
                item.addEventListener("click", async () => {
                    await actions.selectBrand(brand.id);
                });
                return item;
            },
            "No brands created yet."
        );

        renderBrandDetail();
    }

    return { renderBrands, renderBrandDetail };
}
