import { createButtonNode, clearNodeChildren, createNode, createEmptyStateNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { calculateAge } from "../ui.js";

export function createPeopleRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedPerson, createListItem, renderSimpleList } = common;

    function findTypeByName(list, name) {
        return list.find((entry) => String(entry.name || "").toLowerCase() === String(name || "").toLowerCase()) || null;
    }

    function buildUriLink(typeEntry, value) {
        if (!typeEntry?.uri_handler || !value) {
            return null;
        }

        const trimmedValue = String(value).trim();
        if (!trimmedValue) {
            return null;
        }

        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedValue)) {
            return trimmedValue;
        }

        const handler = String(typeEntry.uri_handler || "");
        return `${handler}${trimmedValue}`;
    }

    function buildContactForm(personId) {
        const form = createNode("form", { className: "inline-form" });
        const contactTypeOptions = state.data.typeLists.contactInfoTypes || [];
        const typeSelect = createSelectNode(
            contactTypeOptions.length
                ? contactTypeOptions.map((entry) => ({ value: entry.name, label: entry.name }))
                : [{ value: "", label: "No contact types" }],
            contactTypeOptions[0]?.name || "",
            { name: "contact_type", required: true, disabled: !contactTypeOptions.length }
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

        const relationshipTypes = state.data.typeLists.relationshipTypes || [];
        const relationInput = createSelectNode(
            relationshipTypes.length
                ? relationshipTypes.map((entry) => ({ value: entry.name, label: `${entry.emoji || ""} ${entry.name}`.trim() }))
                : [{ value: "", label: "No relationship types" }],
            relationshipTypes[0]?.name || "",
            {
                name: "relationship_type",
                required: true,
                disabled: !relationshipTypes.length,
            }
        );

        // Perspective selector: visible only for asymmetric relationship types
        const perspectiveSelect = createNode("select", { attrs: { name: "perspective" } });
        perspectiveSelect.style.display = "none";

        function updatePerspectiveOptions() {
            const selectedType = relationshipTypes.find((t) => t.name === relationInput.value);
            const leftLabel = selectedType?.left_label || "";
            const rightLabel = selectedType?.right_label || "";
            const isAsymmetric = leftLabel && rightLabel && leftLabel !== rightLabel;

            perspectiveSelect.style.display = isAsymmetric ? "" : "none";
            perspectiveSelect.innerHTML = "";

            if (isAsymmetric) {
                const leftOption = document.createElement("option");
                leftOption.value = "left";
                leftOption.textContent = leftLabel;
                const rightOption = document.createElement("option");
                rightOption.value = "right";
                rightOption.textContent = rightLabel;
                perspectiveSelect.appendChild(leftOption);
                perspectiveSelect.appendChild(rightOption);
            }
        }

        relationInput.addEventListener("change", updatePerspectiveOptions);
        updatePerspectiveOptions();

        const notesInput = createNode("input", {
            attrs: {
                name: "notes",
                placeholder: "Optional note",
            },
        });

        const submitButton = createButtonNode("Add", "primary-button", null, {
            type: "submit",
            disabled: !people.length || !relationshipTypes.length,
        });

        form.appendChild(personSelect);
        form.appendChild(relationInput);
        form.appendChild(perspectiveSelect);
        form.appendChild(notesInput);
        form.appendChild(submitButton);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.person_id_2) {
                return;
            }

            // Determine id_1/id_2 based on perspective for asymmetric types
            const isRightPerspective = perspectiveSelect.style.display !== "none" && payload.perspective === "right";
            await actions.addRelationship({
                person_id_1: isRightPerspective ? Number(payload.person_id_2) : personId,
                person_id_2: isRightPerspective ? personId : Number(payload.person_id_2),
                relationship_type: payload.relationship_type,
                notes: payload.notes || undefined,
            });
            form.reset();
            updatePerspectiveOptions();
        });

        return form;
    }

    function buildPersonEditForm(person) {
        const form = createNode("form", { className: "form-grid stack compact-form" });
        const firstNameInput = createNode("input", {
            value: person.first_name || "",
            attrs: { name: "first_name", required: true },
        });
        const lastNameInput = createNode("input", {
            value: person.last_name || "",
            attrs: { name: "last_name" },
        });
        const birthDateInput = createNode("input", {
            value: person.birth_date ? String(person.birth_date).slice(0, 10) : "",
            attrs: { name: "birth_date", type: "date" },
        });
        const notesInput = createNode("textarea", {
            value: person.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", { children: [createNode("span", { text: "First name" }), firstNameInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Last name" }), lastNameInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Birthday" }), birthDateInput] }));
        form.appendChild(createNode("label", { children: [createNode("span", { text: "Notes" }), notesInput] }));
        form.appendChild(createButtonNode("Save changes", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.birth_date) {
                delete payload.birth_date;
            }
            if (payload.last_name === "") {
                delete payload.last_name;
            }
            if (payload.notes === "") {
                delete payload.notes;
            }
            await actions.updatePerson(person.id, payload);
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
        const associations = caches.personAssociations.get(person.id) || {
            circleIds: [],
            eventIds: [],
            interactionIds: [],
            brandIds: [],
        };

        const overview = createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Person Details" }),
                        createButtonNode("Delete", "danger-button", async () => {
                            await actions.deletePerson(person.id);
                        }),
                    ],
                }),
                buildPersonEditForm(person),
                createNode("p", { className: "muted", text: `Age: ${calculateAge(person.birth_date) ?? "Unknown"}` }),
            ],
        });
        container.appendChild(overview);

        const contactsSection = createNode("section", { className: "subpanel" });
        const { wrapper: contactFormWrapper, trigger: contactFormTrigger } = wrapCollapsible("+ Add", buildContactForm(person.id));
        contactsSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Contact Info" }), contactFormTrigger] }));
        contactsSection.appendChild(contactFormWrapper);

        const contactsList = createNode("div", { className: "list" });
        renderSimpleList(
            contactsList,
            contacts,
            (contact) => {
                const actionsNode = createNode("div", { className: "list-actions" });
                const typeEntry = findTypeByName(state.data.typeLists.contactInfoTypes || [], contact.contact_type);
                const href = buildUriLink(typeEntry, contact.value);
                if (href) {
                    actionsNode.appendChild(createButtonNode("Open", "secondary-button", () => {
                        window.open(href, "_blank", "noopener,noreferrer");
                    }));
                }
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
        const { wrapper: tagFormWrapper, trigger: tagFormTrigger } = wrapCollapsible("+ Assign", buildTagsAssignmentForm(person.id, tags));
        tagsSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Tags" }), tagFormTrigger] }));
        tagsSection.appendChild(tagFormWrapper);

        const tagCloud = createNode("div", { className: "tag-cloud" });
        if (!tags.length) {
            tagCloud.appendChild(createNode("div", { className: "muted", text: "No tags assigned." }));
        } else {
            tags.forEach((tag) => {
                const pill = createNode("span", { className: "pill" });
                if (tag.color) {
                    pill.style.borderColor = tag.color;
                }

                const nameSpan = createNode("span", { text: tag.name, className: "pill__name" });
                nameSpan.style.cursor = "pointer";
                nameSpan.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await actions.openTagFromContext(tag.id);
                });
                pill.appendChild(nameSpan);
                pill.appendChild(createButtonNode("x", "ghost-button", async () => {
                    await actions.removeTagFromPerson(tag.id, person.id);
                }));
                tagCloud.appendChild(pill);
            });
        }
        tagsSection.appendChild(tagCloud);
        container.appendChild(tagsSection);

        const relSection = createNode("section", { className: "subpanel" });
        const { wrapper: relFormWrapper, trigger: relFormTrigger } = wrapCollapsible("+ Add", buildRelationshipsForm(person.id));
        relSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Relationships" }), relFormTrigger] }));
        relSection.appendChild(relFormWrapper);

        const relList = createNode("div", { className: "list" });
        renderSimpleList(
            relList,
            relationships,
            (relationship) => {
                const counterpartId = relationship.person_id_1 === person.id
                    ? relationship.person_id_2
                    : relationship.person_id_1;
                const typeEntry = findTypeByName(state.data.typeLists.relationshipTypes || [], relationship.relationship_type);
                const perspectiveLabel = relationship.person_id_1 === person.id
                    ? (typeEntry?.left_label || relationship.relationship_type)
                    : (typeEntry?.right_label || relationship.relationship_type);
                const subtitleParts = [
                    typeEntry?.emoji ? `${typeEntry.emoji} ${perspectiveLabel}` : perspectiveLabel,
                    relationship.notes || "",
                ].filter(Boolean);
                const subtitle = subtitleParts.join(" · ");
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.deleteRelationship(relationship.id, person.id);
                }));
                const item = createListItem(nameOfPerson(counterpartId), subtitle, actionsNode);
                item.classList.add("clickable");
                item.addEventListener("click", async () => {
                    await actions.openPersonFromContext(counterpartId);
                });
                return item;
            },
            "No relationships defined."
        );
        relSection.appendChild(relList);
        container.appendChild(relSection);

        const assocSection = createNode("section", { className: "subpanel" });
        assocSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h3", { text: "Associated Entities" })] }));

        const circlesNode = createNode("div", { className: "list" });
        const associatedCircles = state.data.circles.filter((circle) => associations.circleIds.includes(circle.id));
        renderSimpleList(
            circlesNode,
            associatedCircles,
            (circle) => {
                const item = createListItem(circle.name, "Social circle");
                item.addEventListener("click", async () => {
                    state.activeSection = "circles";
                    await actions.selectCircle(circle.id);
                });
                return item;
            },
            "No associated circles."
        );
        const availableCircles = state.data.circles.filter((circle) => !associations.circleIds.includes(circle.id));
        const circleForm = createNode("form", { className: "inline-form" });
        const circleOptions = availableCircles.length
            ? availableCircles.map((circle) => ({ value: circle.id, label: circle.name }))
            : [{ value: "", label: "No available circles" }];
        circleForm.appendChild(createSelectNode(circleOptions, "", { name: "circle_id", disabled: availableCircles.length ? undefined : true }));
        circleForm.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit", disabled: !availableCircles.length }));
        circleForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = createFormDataObject(circleForm);
            if (!values.circle_id) {
                return;
            }
            await actions.addCircleMember(Number(values.circle_id), person.id);
        });
        const { wrapper: circleFormWrapper, trigger: circleFormTrigger } = wrapCollapsible("+ Add", circleForm);
        assocSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h4", { text: "Circles" }), circleFormTrigger] }));
        assocSection.appendChild(circleFormWrapper);
        assocSection.appendChild(circlesNode);

        const eventsNode = createNode("div", { className: "list" });
        const associatedEvents = state.data.events.filter((event) => associations.eventIds.includes(event.id));
        renderSimpleList(
            eventsNode,
            associatedEvents,
            (event) => {
                const item = createListItem(event.title || event.location || "Event", "Event");
                item.addEventListener("click", async () => {
                    state.activeSection = "events";
                    await actions.selectEvent(event.id);
                });
                return item;
            },
            "No associated events."
        );

        const availableEvents = state.data.events.filter((event) => !associations.eventIds.includes(event.id));
        const eventForm = createNode("form", { className: "inline-form" });
        const eventOptions = availableEvents.length
            ? availableEvents.map((event) => ({ value: event.id, label: event.title || event.location || `Event #${event.id}` }))
            : [{ value: "", label: "No available events" }];
        eventForm.appendChild(createSelectNode(eventOptions, "", { name: "event_id", disabled: availableEvents.length ? undefined : true }));
        eventForm.appendChild(createNode("input", { attrs: { name: "role", placeholder: "role (optional)" } }));
        eventForm.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit", disabled: !availableEvents.length }));
        eventForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const vals = createFormDataObject(eventForm);
            if (!vals.event_id) return;
            await actions.addEventParticipant(Number(vals.event_id), person.id, vals.role || undefined);
        });
        const { wrapper: eventFormWrapper, trigger: eventFormTrigger } = wrapCollapsible("+ Add", eventForm);
        assocSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h4", { text: "Events" }), eventFormTrigger] }));
        assocSection.appendChild(eventFormWrapper);
        assocSection.appendChild(eventsNode);

        const interactionsNode = createNode("div", { className: "list" });
        const associatedInteractions = state.data.interactions.filter((interaction) => associations.interactionIds.includes(interaction.id));
        renderSimpleList(
            interactionsNode,
            associatedInteractions,
            (interaction) => {
                const item = createListItem(interaction.title || interaction.medium || "Interaction", "Interaction");
                item.addEventListener("click", async () => {
                    state.activeSection = "interactions";
                    await actions.selectInteraction(interaction.id);
                });
                return item;
            },
            "No associated interactions."
        );

        const availableInteractions = state.data.interactions.filter((interaction) => !associations.interactionIds.includes(interaction.id));
        const interactionForm = createNode("form", { className: "inline-form" });
        const interactionOptions = availableInteractions.length
            ? availableInteractions.map((interaction) => ({ value: interaction.id, label: interaction.title || interaction.medium || `Interaction #${interaction.id}` }))
            : [{ value: "", label: "No available interactions" }];
        interactionForm.appendChild(createSelectNode(interactionOptions, "", { name: "interaction_id", disabled: availableInteractions.length ? undefined : true }));
        interactionForm.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit", disabled: !availableInteractions.length }));
        interactionForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const vals = createFormDataObject(interactionForm);
            if (!vals.interaction_id) return;
            await actions.addInteractionParticipant(Number(vals.interaction_id), person.id);
        });
        const { wrapper: interactionFormWrapper, trigger: interactionFormTrigger } = wrapCollapsible("+ Add", interactionForm);
        assocSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h4", { text: "Interactions" }), interactionFormTrigger] }));
        assocSection.appendChild(interactionFormWrapper);
        assocSection.appendChild(interactionsNode);

        const brandsNode = createNode("div", { className: "list" });
        const associatedBrands = state.data.brands.filter((brand) => associations.brandIds.includes(brand.id));
        renderSimpleList(
            brandsNode,
            associatedBrands,
            (brand) => {
                const item = createListItem(brand.name, "Brand");
                item.addEventListener("click", async () => {
                    state.activeSection = "brands";
                    await actions.selectBrand(brand.id);
                });
                return item;
            },
            "No associated brands yet."
        );
        assocSection.appendChild(createNode("h4", { text: "Brands" }));
        assocSection.appendChild(brandsNode);

        container.appendChild(assocSection);
    }

    function renderPeople() {
        const people = filtered(
            "people",
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
                const assignedTags = caches.peopleTagSummaries.get(person.id) || [];
                const age = calculateAge(person.birth_date);
                const tagsNode = createNode("div", { className: "tag-cloud" });

                if (!assignedTags.length) {
                    tagsNode.appendChild(createNode("span", { className: "muted", text: "No tags" }));
                } else {
                    assignedTags.forEach((tag) => {
                        const pill = createNode("span", { className: "pill" });
                        if (tag.color) {
                            pill.style.borderColor = tag.color;
                            pill.style.backgroundColor = `${tag.color}20`;
                        }
                        pill.appendChild(createNode("span", { text: tag.name }));
                        tagsNode.appendChild(pill);
                    });
                }

                const titleNode = createNode("h4", {
                    children: [
                        createNode("span", { text: `${person.first_name} ${person.last_name || ""}`.trim() }),
                        createNode("span", { className: "age-hint", text: age === null ? "" : ` age ${age}` }),
                    ],
                });

                const item = createNode("div", {
                    className: "list-item",
                    children: [
                        createNode("div", {
                            className: "list-item__row",
                            children: [
                                createNode("div", {
                                    children: [titleNode, tagsNode],
                                }),
                            ],
                        }),
                    ],
                });

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
