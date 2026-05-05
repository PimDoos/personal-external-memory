import {
    clearNodeChildren,
    createButtonNode,
    createFormDataObject,
    createNode,
    createSelectNode,
    wrapCollapsible,
} from "../dom.js";

export function createTagsRenderer({ state, caches, actions, common }) {
    const { filtered, createListItem, renderSimpleList } = common;

    function personDisplayName(person) {
        return `${person.first_name} ${person.last_name || ""}`.trim() || `Person #${person.id}`;
    }

    function tagsForPerson(person) {
        const cachedTags = caches.personTags.get(person.id);
        if (Array.isArray(cachedTags) && cachedTags.length) {
            return cachedTags;
        }
        return Array.isArray(person.tags) ? person.tags : [];
    }

    function buildAssociateEntityForm(tagId, associatedPeople) {
        const associatedIds = new Set(associatedPeople.map((person) => person.id));
        const availablePeople = state.data.people
            .filter((person) => !associatedIds.has(person.id))
            .sort((left, right) => personDisplayName(left).localeCompare(personDisplayName(right), undefined, { sensitivity: "base" }));

        const form = createNode("form", { className: "inline-form" });
        const personOptions = availablePeople.length
            ? availablePeople.map((person) => ({ value: person.id, label: personDisplayName(person) }))
            : [{ value: "", label: "No people available" }];

        const peopleSelect = createSelectNode(personOptions, "", {
            name: "person_id",
            disabled: !availablePeople.length,
        });

        form.appendChild(peopleSelect);
        form.appendChild(createButtonNode("Associate", "primary-button", null, {
            type: "submit",
            disabled: !availablePeople.length,
        }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = createFormDataObject(form);
            if (!values.person_id) {
                return;
            }
            await actions.assignTagToPerson(tagId, Number(values.person_id));
        });

        return form;
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

    function buildTagEditForm(tag) {
        const form = createNode("form", { className: "form-grid compact-form" });
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
                payload.description = null;
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
        const associatedPeople = state.data.people
            .filter((person) => tagsForPerson(person).some((tagSummary) => tagSummary.id === tag.id))
            .sort((left, right) => personDisplayName(left).localeCompare(personDisplayName(right), undefined, { sensitivity: "base" }));

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

        const associatedSection = createNode("section", { className: "subpanel" });
        const { wrapper: associateFormWrapper, trigger: associateFormTrigger } = wrapCollapsible(
            "+ Associate",
            buildAssociateEntityForm(tag.id, associatedPeople)
        );

        associatedSection.appendChild(createNode("div", {
            className: "panel-heading",
            children: [
                createNode("h3", { text: "Associated Entities" }),
                associateFormTrigger,
            ],
        }));
        associatedSection.appendChild(associateFormWrapper);

        const associationsList = createNode("div", { className: "list" });
        renderSimpleList(
            associationsList,
            associatedPeople,
            (person) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("click", (event) => {
                    event.stopPropagation();
                });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeTagFromPerson(tag.id, person.id);
                }));

                const item = createListItem(personDisplayName(person), "person", actionsNode);
                item.classList.add("clickable");
                bindEntityNavigation(item, "people", person.id, async () => {
                    await actions.openPersonFromContext(person.id);
                });
                return item;
            },
            "No associated entities."
        );

        associatedSection.appendChild(associationsList);
        container.appendChild(associatedSection);
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
                bindEntityNavigation(item, "tags", tag.id, async () => {
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
