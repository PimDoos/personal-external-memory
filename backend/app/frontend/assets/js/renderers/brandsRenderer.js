import { clearNodeChildren, createButtonNode, createFormDataObject, createNode } from "../dom.js";

export function createBrandsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function buildBrandMembersPanel(brand) {
        const members = common.caches.brandMembers.get(brand.id) || [];
        const memberPersonIds = new Set(members.map((m) => m.person_id || m));
        const availablePeople = state.data.people.filter(
            (person) => !memberPersonIds.has(person.id)
        );

        const panel = createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [createNode("h3", { text: "Members" })],
                }),
            ],
        });

        // Members list
        const membersList = createNode("div", { className: "list compact-list" });
        members.forEach((member) => {
            const personId = member.person_id || member;
            const person = state.data.people.find((p) => p.id === personId);
            if (!person) {
                return;
            }
            
            const memberTypeLabel = member.type || "(no type)";
            const item = createNode("div", {
                className: "list-item horizontal-flex",
                children: [
                    createNode("span", {
                        text: `${person.first_name} ${person.last_name || ""}`.trim(),
                    }),
                    createNode("span", {
                        className: "secondary-text",
                        text: memberTypeLabel,
                        style: { fontSize: "0.9em", opacity: "0.7" },
                    }),
                    createButtonNode("Edit", "compact-button", async () => {
                        const newType = prompt("Enter new member type:", member.type || "");
                        if (newType !== null && newType !== member.type) {
                            await actions.changeBrandMemberType(brand.id, personId, newType || null);
                        }
                    }),
                    createButtonNode("Remove", "compact-button", async () => {
                        await actions.removeBrandMember(brand.id, personId);
                    }),
                ],
            });
            membersList.appendChild(item);
        });

        if (members.length === 0) {
            membersList.appendChild(
                createNode("div", {
                    className: "list-placeholder",
                    text: "No members yet",
                })
            );
        }

        panel.appendChild(membersList);

        // Add member form
        if (availablePeople.length > 0) {
            const form = createNode("form", { className: "form-grid stack compact-form" });
            const personSelect = createNode("select", {
                attrs: { name: "person_id", required: true },
            });
            personSelect.appendChild(
                createNode("option", {
                    attrs: { value: "" },
                    text: "Select person...",
                })
            );
            availablePeople.forEach((person) => {
                personSelect.appendChild(
                    createNode("option", {
                        attrs: { value: String(person.id) },
                        text: `${person.first_name} ${person.last_name || ""}`.trim(),
                    })
                );
            });

            const typeSelect = createNode("select", {
                attrs: { name: "type" },
            });
            typeSelect.appendChild(
                createNode("option", {
                    attrs: { value: "" },
                    text: "(no type)",
                })
            );
            (state.data.typeLists.brandMembershipTypes || []).forEach((typeEntry) => {
                typeSelect.appendChild(
                    createNode("option", {
                        attrs: { value: typeEntry.name },
                        text: typeEntry.name,
                    })
                );
            });

            form.appendChild(
                createNode("label", {
                    children: [
                        createNode("span", { text: "Add member" }),
                        personSelect,
                    ],
                })
            );
            form.appendChild(
                createNode("label", {
                    children: [
                        createNode("span", { text: "Member type" }),
                        typeSelect,
                    ],
                })
            );
            form.appendChild(
                createButtonNode("Add", "primary-button", null, { type: "submit" })
            );

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const payload = createFormDataObject(form);
                await actions.addBrandMember(brand.id, Number(payload.person_id), payload.type || null);
                form.reset();
            });

            panel.appendChild(form);
        }

        return panel;
    }

    function buildBrandEditForm(brand) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const nameInput = createNode("input", {
            value: brand.name || "",
            attrs: { name: "name", required: true },
        });
        const descriptionInput = createNode("input", {
            value: brand.description || "",
            attrs: { name: "description" },
        });
        const notesInput = createNode("textarea", {
            value: brand.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Name" }), nameInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Description" }), descriptionInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Notes" }), notesInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.description === "") {
                delete payload.description;
            }
            if (payload.notes === "") {
                delete payload.notes;
            }
            await actions.updateBrand(brand.id, payload);
        });

        return form;
    }

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
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Brand Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deleteBrand(brand.id);
                        }),
                    ],
                }),
                buildBrandEditForm(brand),
            ],
        }));
        container.appendChild(buildBrandMembersPanel(brand));
    }

    function renderBrands() {
        const brands = filtered(
            "brands",
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
                const item = createListItem(
                    brand.name,
                    brand.description || brand.notes || "No description"
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
