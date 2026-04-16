import { createButtonNode, clearNodeChildren, createNode, createEmptyStateNode, createSelectNode, createFormDataObject } from "../dom.js";
import { formatBirthday } from "../ui.js";

export function createPeopleRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedPerson, createListItem, renderSimpleList } = common;

    function buildContactForm(personId) {
        const form = createNode("form", { className: "inline-form" });
        const typeSelect = createSelectNode(
            [
                { value: "phone", label: "Phone" },
                { value: "email", label: "Email" },
                { value: "address", label: "Address" },
                { value: "social_media", label: "Social Media" },
            ],
            "phone",
            { name: "contact_type", required: true }
        );
        const valueInput = createNode("input", { attrs: { name: "value", required: true, placeholder: "Value" } });

        form.appendChild(typeSelect);
        form.appendChild(valueInput);
        form.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            payload.person_id = personId;
            await actions.addContact(payload);
            form.reset();
        });

        return form;
    }

    function buildTagsAssignmentForm(personId, assignedTags) {
        const availableTags = state.data.tags.filter((tag) => !assignedTags.some((assigned) => assigned.id === tag.id));
        const form = createNode("form", { className: "inline-form" });

        const tagOptions = availableTags.length
            ? availableTags.map((tag) => ({ value: tag.id, label: tag.name }))
            : [{ value: "", label: "No tags available" }];

        const tagSelect = createSelectNode(tagOptions, "", {
            name: "tag_id",
            disabled: availableTags.length ? undefined : true,
        });

        const assignButton = createButtonNode("Assign tag", "primary-button", null, {
            type: "submit",
            disabled: !availableTags.length,
        });

        form.appendChild(tagSelect);
        form.appendChild(assignButton);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = createFormDataObject(form);
            if (!values.tag_id) {
                return;
            }
            await actions.assignTagToPerson(Number(values.tag_id), personId);
        });

        return form;
    }

    function buildRelationshipsForm(personId) {
        const form = createNode("form", { className: "inline-form" });
        const people = state.data.people.filter((entry) => entry.id !== personId);

        const peopleOptions = people.length
            ? people.map((entry) => ({ value: entry.id, label: `${entry.first_name} ${entry.last_name || ""}`.trim() }))
            : [{ value: "", label: "No available people" }];

        const personSelect = createSelectNode(peopleOptions, "", {
            name: "person_id_2",
            disabled: people.length ? undefined : true,
        });

        const relationInput = createNode("input", {
            attrs: {
                name: "relationship_type",
                required: true,
                placeholder: "friend, sibling, colleague",
            },
        });

        const notesInput = createNode("input", {
            attrs: {
                name: "notes",
                placeholder: "Optional note",
            },
        });

        const submitButton = createButtonNode("Add", "primary-button", null, {
            type: "submit",
            disabled: !people.length,
        });

        form.appendChild(personSelect);
        form.appendChild(relationInput);
        form.appendChild(notesInput);
        form.appendChild(submitButton);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.person_id_2) {
                return;
            }
            await actions.addRelationship({
                person_id_1: personId,
                person_id_2: Number(payload.person_id_2),
                relationship_type: payload.relationship_type,
                notes: payload.notes || undefined,
            });
            form.reset();
        });

        return form;
    }

    function renderPersonDetail() {
        const panel = document.getElementById("person-detail-panel");
        const form = document.getElementById("person-form");
        const container = document.getElementById("person-detail");
        const person = selectedPerson();
        const mode = state.sidebar.people;

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

        if (!person) {
            panel.classList.add("hidden");
            return;
        }

        clearNodeChildren(container);
        container.className = "detail-grid";

        const contacts = caches.personContacts.get(person.id) || [];
        const tags = caches.personTags.get(person.id) || [];
        const relationships = caches.personRelationships.get(person.id) || [];

        const overview = createNode("article", {
            children: [
                createNode("h3", { text: `${person.first_name} ${person.last_name || ""}`.trim() }),
                createNode("p", { className: "muted", text: `Birthday: ${person.birth_date ? formatBirthday(person.birth_date) : "Unknown"}` }),
                createNode("p", { text: person.notes || "No notes recorded." }),
            ],
        });
        container.appendChild(overview);

        const contactsSection = createNode("section", { className: "subpanel" });
        contactsSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Contact Info" })] }));
        contactsSection.appendChild(buildContactForm(person.id));

        const contactsList = createNode("div", { className: "list" });
        renderSimpleList(
            contactsList,
            contacts,
            (contact) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeContact(contact.id, person.id);
                }));
                return createListItem(contact.contact_type, contact.value, actionsNode);
            },
            "No contact info yet."
        );
        contactsSection.appendChild(contactsList);
        container.appendChild(contactsSection);

        const tagsSection = createNode("section", { className: "subpanel" });
        tagsSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Tags" })] }));
        tagsSection.appendChild(buildTagsAssignmentForm(person.id, tags));

        const tagCloud = createNode("div", { className: "tag-cloud" });
        if (!tags.length) {
            tagCloud.appendChild(createNode("div", { className: "muted", text: "No tags assigned." }));
        } else {
            tags.forEach((tag) => {
                const pill = createNode("span", { className: "pill" });
                if (tag.color) {
                    pill.style.borderColor = tag.color;
                }

                pill.appendChild(createNode("span", { text: tag.name }));
                pill.appendChild(createButtonNode("x", "ghost-button", async () => {
                    await actions.removeTagFromPerson(tag.id, person.id);
                }));
                tagCloud.appendChild(pill);
            });
        }
        tagsSection.appendChild(tagCloud);
        container.appendChild(tagsSection);

        const relSection = createNode("section", { className: "subpanel" });
        relSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Relationships" })] }));
        relSection.appendChild(buildRelationshipsForm(person.id));

        const relList = createNode("div", { className: "list" });
        renderSimpleList(
            relList,
            relationships,
            (relationship) => {
                const counterpartId = relationship.person_id_1 === person.id
                    ? relationship.person_id_2
                    : relationship.person_id_1;
                const subtitle = relationship.notes
                    ? `${relationship.relationship_type} · ${relationship.notes}`
                    : relationship.relationship_type;
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.deleteRelationship(relationship.id, person.id);
                }));
                return createListItem(nameOfPerson(counterpartId), subtitle, actionsNode);
            },
            "No relationships defined."
        );
        relSection.appendChild(relList);
        container.appendChild(relSection);
    }

    function renderPeople() {
        const people = filtered(
            state.data.people,
            (person) => person.first_name,
            (person) => person.last_name,
            (person) => person.notes
        );

        const listNode = document.getElementById("people-list");
        clearNodeChildren(listNode);

        if (!people.length) {
            listNode.appendChild(createEmptyStateNode("No people yet. Add someone to start building your memory graph."));
        } else {
            people.forEach((person) => {
                const actionGroup = createNode("div", { className: "list-actions" });

                actionGroup.appendChild(createButtonNode("Delete", "danger-button", async () => {
                    await actions.deletePerson(person.id);
                }));

                const item = createListItem(
                    `${person.first_name} ${person.last_name || ""}`.trim(),
                    person.notes || "No notes yet",
                    actionGroup
                );

                if (state.selected.personId === person.id) {
                    item.classList.add("active");
                }

                item.addEventListener("click", async () => {
                    await actions.selectPerson(person.id);
                });

                listNode.appendChild(item);
            });
        }

        renderPersonDetail();
    }

    return {
        renderPeople,
        renderPersonDetail,
    };
}
