import { createButtonNode, clearNodeChildren, createNode, createFormDataObject, wrapCollapsible } from "../dom.js";

const CATEGORY_CONFIG = [
    { key: "contactInfoTypes", category: "contact-info", label: "Contact Info Types", panelId: "types-panel-contact-info", fields: ["name", "uri_handler"] },
    { key: "relationshipTypes", category: "relationship", label: "Relationship Types", panelId: "types-panel-relationship", fields: ["name", "left_label", "right_label", "emoji"] },
    { key: "socialCircleTypes", category: "social-circle", label: "Social Circle Types", panelId: "types-panel-social-circle", fields: ["name"] },
    { key: "eventTypes", category: "event", label: "Event Types", panelId: "types-panel-event", fields: ["name"] },
    { key: "eventParticipantRoleTypes", category: "event-participant-role", label: "Event Participant Roles", panelId: "types-panel-event-participant-role", fields: ["name"] },
    { key: "brandMembershipTypes", category: "brand-membership", label: "Brand Membership Types", panelId: "types-panel-brand-membership", fields: ["name"] },
    { key: "locationTypes", category: "location", label: "Location Types", panelId: "types-panel-location", fields: ["name"] },
];

const FIELD_LABELS = {
    name: "Name",
    uri_handler: "URI handler",
    left_label: "Left label",
    right_label: "Right label",
    emoji: "Emoji",
};

export function createTypesRenderer({ state, actions }) {
    function buildTypeEditor(config, entry) {
        const form = createNode("form", { className: "inline-form" });

        config.fields.forEach((field) => {
            const input = createNode("input", {
                value: entry[field] || "",
                attrs: {
                    name: field,
                    placeholder: FIELD_LABELS[field],
                    required: field === "name",
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
                    payload[key] = null;
                }
            });
            await actions.updateType(config.category, entry.id, payload);
        });

        return form;
    }

    function renderCategoryPanel(config) {
        const panel = document.getElementById(config.panelId);
        if (!panel) {
            return;
        }

        clearNodeChildren(panel);
        const entries = state.data.typeLists[config.key] || [];

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
        createForm.appendChild(createButtonNode("Create", "primary-button", null, { type: "submit" }));

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

        const { wrapper: createFormWrapper, trigger: createFormTrigger } = wrapCollapsible("Add", createForm);
        panel.appendChild(createNode("div", {
            className: "panel-heading",
            children: [
                createNode("h3", { text: config.label }),
                createFormTrigger,
            ],
        }));
        panel.appendChild(createFormWrapper);

        const list = createNode("div", { className: "list types-list" });
        if (!entries.length) {
            list.appendChild(createNode("div", { className: "empty-state", text: "No entries yet." }));
        } else {
            entries.forEach((entry) => {
                const metadata = [entry.uri_handler, entry.left_label, entry.right_label, entry.emoji]
                    .filter(Boolean)
                    .join(" · ");
                const actionsNode = createNode("div", { className: "list-actions" });
                const editor = buildTypeEditor(config, entry);
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

        CATEGORY_CONFIG.forEach((config) => {
            renderCategoryPanel(config);
        });
    }

    return {
        renderTypes,
    };
}
