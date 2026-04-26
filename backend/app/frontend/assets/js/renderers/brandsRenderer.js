import { clearNodeChildren, createButtonNode, createFormDataObject, createNode, createSelectNode, wrapCollapsible } from "../dom.js";
import { createCombobox } from "../combobox.js";
import { getAvatarInitials } from "../avatar.js";

export function createBrandsRenderer({ state, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function displayLocationLabel(location) {
        return location.label || location.location || "(unnamed location)";
    }

    function getLocationTypeOptions(currentValue = "") {
        const entries = state.data.typeLists.locationTypes || [];
        const options = entries.map((entry) => ({ value: entry.name, label: entry.name }));
        if (currentValue && !options.some((option) => option.value === currentValue)) {
            options.unshift({ value: currentValue, label: currentValue });
        }
        if (!options.length) {
            options.push({ value: "", label: "No location types" });
        }
        return options;
    }

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

    function buildBrandMembersPanel(brand) {
        const members = common.caches.brandMembers.get(brand.id) || [];
        const memberPersonIds = new Set(members.map((m) => m.person_id || m));
        const availablePeople = state.data.people
            .filter((person) => !memberPersonIds.has(person.id))
            .sort(comparePeopleByFirstName);

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
        const membersList = createNode("div", { className: "list" });
        renderSimpleList(
            membersList,
            members,
            (member) => {
                const personId = member.person_id || member;
                const person = state.data.people.find((p) => p.id === personId);
                if (!person) {
                    return createNode("div", { className: "empty-state", text: "Unknown person" });
                }

                const personName = `${person.first_name} ${person.last_name || ""}`.trim();
                const avatar = createNode("span", {
                    className: "list-avatar list-avatar--person",
                    text: getAvatarInitials(personName),
                    attrs: { title: personName, "aria-label": personName },
                });
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Edit", "secondary-button", async () => {
                    const newType = prompt("Enter new member type:", member.type || "");
                    if (newType !== null && newType !== member.type) {
                        await actions.changeBrandMemberType(brand.id, personId, newType || null);
                    }
                }));
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeBrandMember(brand.id, personId);
                }));
                const item = createListItem(personName, member.type || "(no type)", actionsNode, avatar);
                bindEntityNavigation(item, "people", personId, async () => {
                    await actions.openPersonFromContext(personId);
                });
                return item;
            },
            "No members yet"
        );

        panel.appendChild(membersList);

        // Add member form
        if (availablePeople.length > 0) {
            const form = createNode("form", { className: "form-grid stack compact-form" });
            const personOptions = availablePeople.map((person) => ({
                value: person.id,
                label: `${person.first_name} ${person.last_name || ""}`.trim(),
            }));
            const personSelect = createCombobox(personOptions, "", {
                name: "person_id",
                placeholder: "Search people…",
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
                payload.description = null;
            }
            if (payload.notes === "") {
                payload.notes = null;
            }
            await actions.updateBrand(brand.id, payload);
        });

        return form;
    }

    function buildCreateLocationForm(brandId) {
        const form = createNode("form", { className: "stack compact-form" });
        const labelInput = createNode("input", {
            attrs: { name: "label", placeholder: "Optional label" },
        });
        const typeInput = createSelectNode(
            getLocationTypeOptions(),
            getLocationTypeOptions()[0]?.value || "",
            {
                name: "location_type",
                required: true,
                disabled: !(state.data.typeLists.locationTypes || []).length,
            }
        );
        const locationInput = createNode("input", {
            attrs: { name: "location", required: true, placeholder: "Full address or coordinates" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "Location" }), locationInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Type" }), typeInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Optional label" }), labelInput] }));
        form.appendChild(createButtonNode("Add location", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.label === "") {
                payload.label = null;
            }
            if (payload.location_type === "") {
                payload.location_type = null;
            }
            await actions.createLocationForBrand(brandId, payload);
            form.reset();
            typeInput.value = getLocationTypeOptions()[0]?.value || "";
        });

        return form;
    }

    function buildAssignLocationForm(brandId, assignedLocations) {
        const availableLocations = state.data.locations.filter(
            (location) => !assignedLocations.some((assigned) => assigned.id === location.id)
        );
        const options = availableLocations.length
            ? availableLocations.map((location) => ({
                value: location.id,
                label: location.location_type
                    ? `${displayLocationLabel(location)} (${location.location_type})`
                    : displayLocationLabel(location),
            }))
            : [{ value: "", label: "No available locations" }];

        const form = createNode("form", { className: "inline-form" });
        form.appendChild(createCombobox(options, "", {
            name: "location_id",
            placeholder: availableLocations.length ? "Search locations…" : "No available locations",
            disabled: !availableLocations.length,
        }));
        form.appendChild(createButtonNode("Assign", "primary-button", null, { type: "submit", disabled: !availableLocations.length }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.location_id) {
                return;
            }
            await actions.associateLocationToBrand(Number(payload.location_id), brandId);
        });

        return form;
    }

    function buildBrandLocationsPanel(brand) {
        const locations = common.caches.brandLocations.get(brand.id) || [];
        const addUi = wrapCollapsible("+ Add", buildCreateLocationForm(brand.id));
        const assignUi = wrapCollapsible("+ Assign", buildAssignLocationForm(brand.id, locations));
        const panel = createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Locations" }),
                        createNode("div", {
                            className: "list-actions",
                            children: [addUi.trigger, assignUi.trigger],
                        }),
                    ],
                }),
            ],
        });
        panel.appendChild(addUi.wrapper);
        panel.appendChild(assignUi.wrapper);

        const list = createNode("div", { className: "list" });
        renderSimpleList(
            list,
            locations,
            (location) => {
                const subtitle = [location.location_type || "", location.location || ""].filter(Boolean).join(" · ");
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("click", (e) => e.stopPropagation());
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeLocationFromBrand(location.id, brand.id);
                }));
                const item = createListItem(displayLocationLabel(location), subtitle, actionsNode);
                item.classList.add("clickable");
                item.addEventListener("click", async () => {
                    state.activeSection = "locations";
                    await actions.selectLocation(location.id);
                });
                return item;
            },
            "No locations yet."
        );
        panel.appendChild(list);
        return panel;
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
        container.appendChild(buildBrandLocationsPanel(brand));
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
                bindEntityNavigation(item, "brands", brand.id, async () => {
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
