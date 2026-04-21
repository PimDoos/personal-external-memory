import { createButtonNode, clearNodeChildren, createNode, createFormDataObject } from "../dom.js";

const CATEGORY_CONFIG = [
    { key: "contactInfoTypes", category: "contact-info", label: "Contact Info Types", panelId: "types-panel-contact-info", fields: ["name", "uri_handler"] },
    { key: "relationshipTypes", category: "relationship", label: "Relationship Types", panelId: "types-panel-relationship", fields: ["name", "left_label", "right_label", "emoji"] },
    { key: "socialCircleTypes", category: "social-circle", label: "Social Circle Types", panelId: "types-panel-social-circle", fields: ["name"] },
    { key: "eventTypes", category: "event", label: "Event Types", panelId: "types-panel-event", fields: ["name"] },
    { key: "interactionTypes", category: "interaction", label: "Interaction Types", panelId: "types-panel-interaction", fields: ["name"] },
    { key: "interactionMediums", category: "interaction-medium", label: "Interaction Mediums", panelId: "types-panel-interaction-medium", fields: ["name"] },
];

const FIELD_LABELS = {
    name: "Name",
    uri_handler: "URI handler",
    left_label: "Left label",
    right_label: "Right label",
    emoji: "Emoji",
};

export function createTypesRenderer({ state, actions }) {
    function matchesFilter(entry, needle) {
        if (!needle) {
            return true;
        }
        return [entry.name, entry.uri_handler, entry.left_label, entry.right_label, entry.emoji]
            .some((value) => String(value || "").toLowerCase().includes(needle));
    }

    function buildTypeEditor(category, entry) {
        const form = createNode("form", { className: "inline-form" });

        ["name", "uri_handler", "left_label", "right_label", "emoji"].forEach((field) => {
            const input = createNode("input", {
                value: entry[field] || "",
                attrs: {
                    name: field,
                    placeholder: FIELD_LABELS[field],
                },
            });
            form.appendChild(input);
        });

        form.appendChild(createButtonNode("Save", "secondary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            Object.keys(payload).forEach((key) => {
                if (payload[key] === "") {
                    delete payload[key];
                }
            });
            await actions.updateType(category, entry.id, payload);
        });

        return form;
    }

    function renderCategoryPanel(config, needle) {
        const panel = document.getElementById(config.panelId);
        if (!panel) {
            return;
        }

        clearNodeChildren(panel);
        const entries = (state.data.typeLists[config.key] || []).filter((entry) => matchesFilter(entry, needle));

        panel.appendChild(createNode("div", {
            className: "panel-heading",
            children: [createNode("h3", { text: config.label })],
        }));

        const createForm = createNode("form", { className: "inline-form" });
        config.fields.forEach((field) => {
            createForm.appendChild(createNode("input", {
                attrs: {
                    name: field,
                    placeholder: FIELD_LABELS[field],
                    required: field === "name",
                },
            }));
        });
        createForm.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit" }));

        createForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(createForm);
            Object.keys(payload).forEach((key) => {
                if (payload[key] === "") {
                    delete payload[key];
                }
            });
            await actions.createType(config.category, payload);
            createForm.reset();
        });

        panel.appendChild(createForm);

        const list = createNode("div", { className: "list" });
        if (!entries.length) {
            list.appendChild(createNode("div", { className: "empty-state", text: "No entries yet." }));
        } else {
            entries.forEach((entry) => {
                const metadata = [entry.uri_handler, entry.left_label, entry.right_label, entry.emoji]
                    .filter(Boolean)
                    .join(" · ");
                const actionsNode = createNode("div", { className: "list-actions" });
                const editor = buildTypeEditor(config.category, entry);
                editor.style.display = "none";

                actionsNode.appendChild(createButtonNode("Edit", "secondary-button", () => {
                    editor.style.display = editor.style.display === "none" ? "" : "none";
                }));
                actionsNode.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deleteType(config.category, entry.id);
                }));

                const itemText = createNode("div", {
                    children: [
                        createNode("h4", { text: entry.name }),
                        createNode("p", { className: "muted", text: metadata || "" }),
                    ],
                });
                const row = createNode("div", { className: "list-item", children: [createNode("div", { className: "list-item__row", children: [itemText, actionsNode] }), editor] });
                list.appendChild(row);
            });
        }

        panel.appendChild(list);
    }

    function renderTypes() {
        const section = document.getElementById("section-types");
        if (!section) {
            return;
        }

        const needle = (state.filters.types || "").trim().toLowerCase();
        CATEGORY_CONFIG.forEach((config) => {
            renderCategoryPanel(config, needle);
        });
    }

    return {
        renderTypes,
    };
}
