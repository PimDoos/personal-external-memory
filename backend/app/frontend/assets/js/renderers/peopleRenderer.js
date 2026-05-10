import { createButtonNode, clearNodeChildren, createNode, createEmptyStateNode, createSelectNode, createFormDataObject, wrapCollapsible } from "../dom.js";
import { calculateAge, calculateAgeAtDate, formatDate } from "../ui.js";
import { createCombobox } from "../combobox.js";
import { getAvatarInitials } from "../avatar.js";

export function createPeopleRenderer({ state, caches, actions, common }) {
    const { filtered, nameOfPerson, selectedPerson, createEventCard, createListItem, renderSimpleList } = common;

    function displayEventLabel(event) {
        return event.title || `Event #${event.id}`;
    }

    function displayLocationLabel(location) {
        return location.label || location.location || "(unnamed location)";
    }

    function comparePeopleByFirstName(left, right) {
        const firstNameDelta = String(left.first_name || "").localeCompare(String(right.first_name || ""), undefined, { sensitivity: "base" });
        if (firstNameDelta !== 0) {
            return firstNameDelta;
        }
        return String(left.last_name || "").localeCompare(String(right.last_name || ""), undefined, { sensitivity: "base" });
    }

    function getEventStartTimestamp(event) {
        const timestamp = new Date(event.start_time || event.date || 0).getTime();
        return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
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

    function findTypeByName(list, name) {
        return list.find((entry) => String(entry.name || "").toLowerCase() === String(name || "").toLowerCase()) || null;
    }

    function findRelationshipTypeForRelationship(relationship) {
        const relationshipTypes = state.data.typeLists.relationshipTypes || [];
        if (relationship.relationship_type_id) {
            const byId = relationshipTypes.find((entry) => String(entry.id) === String(relationship.relationship_type_id));
            if (byId) {
                return byId;
            }
        }
        return findTypeByName(relationshipTypes, relationship.type_entry?.name || relationship.relationship_type) || null;
    }

    function perspectiveLabelForRelationship(relationship, personId, typeEntry) {
        const leftLabel = String(typeEntry?.left_label || "").trim();
        const rightLabel = String(typeEntry?.right_label || "").trim();
        if (relationship.person_id_1 === personId) {
            return leftLabel || typeEntry?.name || relationship.relationship_type;
        }
        return rightLabel || typeEntry?.name || relationship.relationship_type;
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

    function contactTypeOptions(currentValue = "") {
        const entries = state.data.typeLists.contactInfoTypes || [];
        const options = entries.map((entry) => ({
            value: entry.name,
            label: entry.display_name || entry.name,
        }));

        const normalizedCurrent = String(currentValue || "").trim();
        if (normalizedCurrent && !options.some((option) => String(option.value).toLowerCase() === normalizedCurrent.toLowerCase())) {
            options.unshift({ value: normalizedCurrent, label: normalizedCurrent });
        }

        if (!options.length) {
            options.push({ value: "", label: "No contact types" });
        }

        return options;
    }

    function contactTypeDisplayLabel(typeEntry, contactType) {
        if (typeEntry?.display_name) {
            return typeEntry.display_name;
        }
        if (typeEntry?.name) {
            return typeEntry.name;
        }

        // Legacy/internal values (e.g. social_media) should still be human-readable.
        return String(contactType || "")
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (match) => match.toUpperCase())
            .trim();
    }

    function buildContactForm(personId) {
        const form = createNode("form", { className: "inline-form" });
        const contactTypes = state.data.typeLists.contactInfoTypes || [];
        const typeSelect = createSelectNode(
            contactTypeOptions(),
            contactTypeOptions()[0]?.value || "",
            { name: "contact_type", required: true, disabled: !contactTypes.length }
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

    function buildEditContactForm(contact) {
        const form = createNode("form", { className: "inline-form" });
        const contactTypes = state.data.typeLists.contactInfoTypes || [];
        const typeSelect = createSelectNode(
            contactTypeOptions(contact.contact_type || ""),
            contact.contact_type || "",
            { name: "contact_type", required: true, disabled: !contactTypes.length }
        );
        const valueInput = createNode("input", {
            value: contact.value || "",
            attrs: { name: "value", required: true, placeholder: "Value" }
        });

        form.appendChild(typeSelect);
        form.appendChild(valueInput);
        form.appendChild(createButtonNode("Save", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            await actions.updateContact(contact.id, payload);
        });

        return form;
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

    function buildCreateLocationForm(personId) {
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
            await actions.createLocationForPerson(personId, payload);
            form.reset();
            typeInput.value = getLocationTypeOptions()[0]?.value || "";
        });

        return form;
    }

    function buildAssociateLocationForm(personId, assignedLocations) {
        const availableLocations = state.data.locations.filter(
            (location) => !assignedLocations.some((assigned) => assigned.id === location.id)
        );
        const form = createNode("form", { className: "inline-form" });
        const locationOptions = availableLocations.length
            ? availableLocations.map((location) => ({
                value: location.id,
                label: location.location_type
                    ? `${displayLocationLabel(location)} (${location.location_type})`
                    : displayLocationLabel(location),
            }))
            : [{ value: "", label: "No available locations" }];

        const locationSelect = createCombobox(locationOptions, "", {
            name: "location_id",
            placeholder: availableLocations.length ? "Search locations…" : "No available locations",
            disabled: !availableLocations.length,
        });

        form.appendChild(locationSelect);
        form.appendChild(createButtonNode("Assign", "primary-button", null, {
            type: "submit",
            disabled: !availableLocations.length,
        }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.location_id) {
                return;
            }
            await actions.associateLocationToPerson(Number(payload.location_id), personId);
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
        const people = state.data.people
            .filter((entry) => entry.id !== personId)
            .sort(comparePeopleByFirstName);

        const peopleOptions = people.map((entry) => ({ value: entry.id, label: `${entry.first_name} ${entry.last_name || ""}`.trim() }));

        const personSelect = createCombobox(peopleOptions, "", {
            name: "person_id_2",
            placeholder: people.length ? "Search people…" : "No available people",
            disabled: !people.length,
        });

        const relationshipTypes = state.data.typeLists.relationshipTypes || [];
        const relationInput = createSelectNode(
            relationshipTypes.length
                ? relationshipTypes.map((entry) => ({ value: String(entry.id), label: `${entry.emoji || ""} ${entry.name}`.trim() }))
                : [{ value: "", label: "No relationship types" }],
            relationshipTypes[0]?.id ? String(relationshipTypes[0].id) : "",
            {
                name: "relationship_type_id",
                required: true,
                disabled: !relationshipTypes.length,
            }
        );

        // Perspective selector: visible only for asymmetric relationship types
        const perspectiveSelect = createNode("select", { attrs: { name: "perspective" } });
        perspectiveSelect.style.display = "none";

        function updatePerspectiveOptions() {
            const selectedType = relationshipTypes.find((t) => String(t.id) === String(relationInput.value));
            const leftLabel = String(selectedType?.left_label || "").trim();
            const rightLabel = String(selectedType?.right_label || "").trim();
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
            const isRightPerspective = perspectiveSelect.style.display !== "none" && payload.perspective === "right";
            await actions.addRelationship({
                person_id_1: isRightPerspective ? Number(payload.person_id_2) : personId,
                person_id_2: isRightPerspective ? personId : Number(payload.person_id_2),
                relationship_type_id: Number(payload.relationship_type_id),
                notes: payload.notes || undefined,
            });
            form.reset();
            updatePerspectiveOptions();
        });

        return form;
    }

    function buildEditRelationshipForm(relationship, personId) {
        const form = createNode("form", { className: "inline-form" });
        const relationshipTypes = state.data.typeLists.relationshipTypes || [];
        const resolvedTypeEntry = findRelationshipTypeForRelationship(relationship) || relationship.type_entry || null;
        const selectedRelationshipTypeId = resolvedTypeEntry?.id || relationship.relationship_type_id || "";
        const relationInput = createSelectNode(
            relationshipTypes.length
                ? relationshipTypes.map((entry) => ({ value: String(entry.id), label: `${entry.emoji || ""} ${entry.name}`.trim() }))
                : [{ value: selectedRelationshipTypeId || "", label: resolvedTypeEntry?.name || relationship.relationship_type || "No relationship types" }],
            String(selectedRelationshipTypeId || ""),
            {
                name: "relationship_type_id",
                required: true,
                disabled: !relationshipTypes.length,
            }
        );
        const perspectiveSelect = createNode("select", { attrs: { name: "perspective" } });
        perspectiveSelect.style.display = "none";

        function updatePerspectiveOptions() {
            const selectedType = relationshipTypes.find((t) => String(t.id) === String(relationInput.value));
            const leftLabel = String(selectedType?.left_label || "").trim();
            const rightLabel = String(selectedType?.right_label || "").trim();
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

                const currentPerspective = relationship.person_id_1 === personId ? "left" : "right";
                perspectiveSelect.value = currentPerspective;
            }
        }

        relationInput.addEventListener("change", updatePerspectiveOptions);
        updatePerspectiveOptions();

        const notesInput = createNode("input", {
            value: relationship.notes || "",
            attrs: {
                name: "notes",
                placeholder: "Optional note",
            },
        });

        form.appendChild(relationInput);
        form.appendChild(perspectiveSelect);
        form.appendChild(notesInput);
        form.appendChild(createButtonNode("Save", "primary-button", null, { type: "submit" }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            const currentPerspective = relationship.person_id_1 === personId ? "left" : "right";
            const hasPerspectiveChoice = perspectiveSelect.style.display !== "none";
            const shouldSwapDirection = hasPerspectiveChoice
                && payload.perspective
                && payload.perspective !== currentPerspective;
            await actions.updateRelationship(
                relationship.id,
                {
                    relationship_type_id: Number(payload.relationship_type_id) || Number(selectedRelationshipTypeId) || relationship.relationship_type_id,
                    notes: payload.notes === "" ? null : payload.notes,
                },
                relationship.person_id_1,
                relationship.person_id_2,
                shouldSwapDirection,
            );
        });

        return form;
    }

    function buildPersonEditForm(person) {
        const form = createNode("form", { className: "form-grid compact-form" });
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
        const deathDateInput = createNode("input", {
            value: person.date_of_death ? String(person.date_of_death).slice(0, 10) : "",
            attrs: { name: "date_of_death", type: "date" },
        });
        const notesInput = createNode("textarea", {
            value: person.notes || "",
            attrs: { name: "notes", rows: "3" },
        });

        form.appendChild(createNode("label", {
            className: "person-form__pair-item",
            children: [createNode("span", { text: "First name" }), firstNameInput],
        }));
        form.appendChild(createNode("label", {
            className: "person-form__pair-item",
            children: [createNode("span", { text: "Last name" }), lastNameInput],
        }));
        form.appendChild(createNode("label", {
            className: "person-form__pair-item",
            children: [createNode("span", { text: "Birthday" }), birthDateInput],
        }));
        form.appendChild(createNode("label", {
            className: "person-form__pair-item",
            children: [createNode("span", { text: "Date of death" }), deathDateInput],
        }));
        form.appendChild(createNode("label", {
            className: "person-form__notes",
            children: [createNode("span", { text: "Notes" }), notesInput],
        }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (!payload.birth_date) {
                payload.birth_date = null;
            }
            if (!payload.date_of_death) {
                payload.date_of_death = null;
            }
            if (payload.last_name === "") {
                payload.last_name = null;
            }
            if (payload.notes === "") {
                payload.notes = null;
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
        const locations = caches.personLocations.get(person.id) || [];
        const tags = caches.personTags.get(person.id) || [];
        const relationships = caches.personRelationships.get(person.id) || [];
        const associations = caches.personAssociations.get(person.id) || {
            circleIds: [],
            eventIds: [],
            brandIds: [],
        };

        const personEditForm = buildPersonEditForm(person);
        personEditForm.classList.add("person-form", "person-form--detail");
        const savePersonButton = createButtonNode("Save", "primary-button", () => {
            personEditForm.requestSubmit();
        }, { type: "button" });

        const overview = createNode("article", {
            className: `subpanel${person.date_of_death ? " person-card--deceased" : ""}`,
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Person Details" }),
                        createNode("div", {
                            className: "list-actions",
                            children: [
                                savePersonButton,
                                createButtonNode("Delete", "danger-button", async () => {
                                    await actions.deletePerson(person.id);
                                }),
                            ],
                        }),
                    ],
                }),
                personEditForm,
                createNode("p", {
                    className: "muted",
                    text: person.date_of_death
                        ? `Deceased${person.date_of_death ? ` on ${formatDate(person.date_of_death)}` : ""}${calculateAgeAtDate(person.birth_date, person.date_of_death) !== null ? ` · age ${calculateAgeAtDate(person.birth_date, person.date_of_death)}` : ""}`
                        : `Age: ${calculateAge(person.birth_date) ?? "Unknown"}`,
                }),
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
                actionsNode.addEventListener("mousedown", (eventObj) => {
                    eventObj.stopPropagation();
                });
                actionsNode.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });
                const typeEntry = findTypeByName(state.data.typeLists.contactInfoTypes || [], contact.contact_type);
                const displayTypeName = contactTypeDisplayLabel(typeEntry, contact.contact_type);
                const href = buildUriLink(typeEntry, contact.value);

                const editForm = buildEditContactForm(contact);
                const editButton = createButtonNode("Edit", "secondary-button", () => {
                    const editContainer = document.getElementById(`contact-edit-${contact.id}`);
                    if (!editContainer) return;
                    editContainer.classList.remove("hidden");
                    editButton.style.display = "none";
                    removeButton.style.display = "none";
                });
                const cancelButton = createButtonNode("Cancel", "secondary-button", () => {
                    const editContainer = document.getElementById(`contact-edit-${contact.id}`);
                    if (!editContainer) return;
                    editContainer.classList.add("hidden");
                    editButton.style.display = "";
                    removeButton.style.display = "";
                });

                actionsNode.appendChild(editButton);

                const removeButton = createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeContact(contact.id, person.id);
                });
                actionsNode.appendChild(removeButton);

                const item = createListItem(displayTypeName, contact.value, actionsNode);
                if (href) {
                    item.classList.add("clickable");
                    item.addEventListener("click", () => {
                        window.open(href, "_blank", "noopener,noreferrer");
                    });
                    item.addEventListener("auxclick", (eventObj) => {
                        if (eventObj.button !== 1) {
                            return;
                        }
                        eventObj.preventDefault();
                        window.open(href, "_blank", "noopener,noreferrer");
                    });
                }

                const editContainer = createNode("div", { attrs: { id: `contact-edit-${contact.id}` }, className: "hidden" });
                editContainer.addEventListener("mousedown", (eventObj) => {
                    eventObj.stopPropagation();
                });
                editContainer.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });
                editContainer.appendChild(editForm);
                editContainer.appendChild(cancelButton);
                item.appendChild(editContainer);

                return item;
            },
            "No contact info yet."
        );
        contactsSection.appendChild(contactsList);
        container.appendChild(contactsSection);

        const locationsSection = createNode("section", { className: "subpanel" });
        const createLocationUi = wrapCollapsible("+ Add", buildCreateLocationForm(person.id));
        const associateLocationUi = wrapCollapsible("+ Assign", buildAssociateLocationForm(person.id, locations));
        locationsSection.appendChild(createNode("div", {
            className: "panel-heading",
            children: [
                createNode("h3", { text: "Locations" }),
                createNode("div", {
                    className: "list-actions",
                    children: [createLocationUi.trigger, associateLocationUi.trigger],
                }),
            ],
        }));
        locationsSection.appendChild(createLocationUi.wrapper);
        locationsSection.appendChild(associateLocationUi.wrapper);

        const locationsList = createNode("div", { className: "list" });
        renderSimpleList(
            locationsList,
            locations,
            (location) => {
                const subtitleParts = [location.location_type || "", location.location || ""].filter(Boolean);
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("click", (e) => e.stopPropagation());
                actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                    await actions.removeLocationFromPerson(location.id, person.id);
                }));
                const item = createListItem(displayLocationLabel(location), subtitleParts.join(" · "), actionsNode);
                item.classList.add("clickable");
                item.addEventListener("click", async () => {
                    state.activeSection = "locations";
                    await actions.selectLocation(location.id);
                });
                return item;
            },
            "No locations yet."
        );
        locationsSection.appendChild(locationsList);
        container.appendChild(locationsSection);

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
                    if (event.metaKey || event.ctrlKey) {
                        event.preventDefault();
                        actions.openViewInNewTab("tags", tag.id);
                        return;
                    }
                    await actions.openTagFromContext(tag.id);
                });
                nameSpan.addEventListener("auxclick", (event) => {
                    if (event.button !== 1) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    actions.openViewInNewTab("tags", tag.id);
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
                const counterpartName = nameOfPerson(counterpartId);
                const typeEntry = findRelationshipTypeForRelationship(relationship) || relationship.type_entry || null;
                const perspectiveLabel = perspectiveLabelForRelationship(relationship, person.id, typeEntry);
                const relationshipDisplay = typeEntry?.emoji ? `${typeEntry.emoji} ${perspectiveLabel}` : perspectiveLabel;
                const subtitle = createNode("p", {
                    className: "muted",
                    children: [
                        createNode("span", { className: "relationship-chip__label", text: relationshipDisplay }),
                        createNode("span", { text: " of " }),
                        createNode("span", { className: "relationship-chip__name", text: counterpartName }),
                        ...(relationship.notes
                            ? [createNode("span", { text: ` · ${relationship.notes}` })]
                            : []),
                    ],
                });
                const actionsNode = createNode("div", { className: "list-actions" });
                actionsNode.addEventListener("mousedown", (eventObj) => {
                    eventObj.stopPropagation();
                });
                actionsNode.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });

                const removeButton = createButtonNode("Remove", "danger-button", async () => {
                    await actions.deleteRelationship(relationship.id, person.id);
                });
                const editButton = createButtonNode("Edit", "secondary-button", () => {
                    const editContainer = document.getElementById(`relationship-edit-${relationship.id}`);
                    if (!editContainer) return;
                    editContainer.classList.remove("hidden");
                    editButton.style.display = "none";
                    removeButton.style.display = "none";
                });
                const cancelButton = createButtonNode("Cancel", "secondary-button", () => {
                    const editContainer = document.getElementById(`relationship-edit-${relationship.id}`);
                    if (!editContainer) return;
                    editContainer.classList.add("hidden");
                    editButton.style.display = "";
                    removeButton.style.display = "";
                });

                actionsNode.appendChild(editButton);
                actionsNode.appendChild(removeButton);
                const avatar = createNode("span", {
                    className: "list-avatar",
                    text: getAvatarInitials(counterpartName),
                    attrs: { title: counterpartName, "aria-label": counterpartName },
                });
                const item = createListItem("", subtitle, actionsNode, avatar);

                const editContainer = createNode("div", { attrs: { id: `relationship-edit-${relationship.id}` }, className: "hidden" });
                editContainer.addEventListener("mousedown", (eventObj) => {
                    eventObj.stopPropagation();
                });
                editContainer.addEventListener("click", (eventObj) => {
                    eventObj.stopPropagation();
                });
                editContainer.appendChild(buildEditRelationshipForm(relationship, person.id));
                editContainer.appendChild(cancelButton);
                item.appendChild(editContainer);

                item.classList.add("clickable");
                bindEntityNavigation(item, "people", counterpartId, async () => {
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
                bindEntityNavigation(item, "circles", circle.id, async () => {
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
        const associatedEvents = state.data.events
            .filter((event) => associations.eventIds.includes(event.id))
            .sort((left, right) => getEventStartTimestamp(left) - getEventStartTimestamp(right));
        renderSimpleList(
            eventsNode,
            associatedEvents,
            (event) => {
                const item = createEventCard(event);
                bindEntityNavigation(item, "events", event.id, async () => {
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
            ? availableEvents.map((event) => ({ value: event.id, label: displayEventLabel(event) }))
            : [{ value: "", label: "No available events" }];
        eventForm.appendChild(createSelectNode(eventOptions, "", { name: "event_id", disabled: availableEvents.length ? undefined : true }));
        const eventParticipantRoleOptions = [{ value: "", label: "No role" }]
            .concat((state.data.typeLists.eventParticipantRoleTypes || []).map((entry) => ({ value: entry.name, label: entry.name })));
        eventForm.appendChild(createSelectNode(eventParticipantRoleOptions, "", { name: "role" }));
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

        const brandsNode = createNode("div", { className: "list" });
        const associatedBrands = state.data.brands.filter((brand) => associations.brandIds.includes(brand.id));
        renderSimpleList(
            brandsNode,
            associatedBrands,
            (brand) => {
                const isExplicit = (associations.explicitBrandIds || []).includes(brand.id);
                const actionsNode = isExplicit ? createNode("div", { className: "list-actions" }) : null;
                if (actionsNode) {
                    actionsNode.addEventListener("mousedown", (eventObj) => {
                        eventObj.stopPropagation();
                    });
                    actionsNode.addEventListener("click", (eventObj) => {
                        eventObj.stopPropagation();
                    });

                    const members = caches.brandMembers.get(brand.id) || [];
                    const memberEntry = members.find((entry) => (entry.person_id || entry) === person.id);
                    const currentType = memberEntry?.type || "";
                    const typeOptions = [{ value: "", label: "(no type)" }]
                        .concat((state.data.typeLists.brandMembershipTypes || []).map((entry) => ({ value: entry.name, label: entry.name })));
                    const typeSelect = createSelectNode(typeOptions, currentType, { name: "type" });
                    typeSelect.style.display = "none";

                    const saveButton = createButtonNode("Save", "secondary-button", async () => {
                        await actions.changeBrandMemberType(brand.id, person.id, typeSelect.value || null);
                        typeSelect.style.display = "none";
                        saveButton.style.display = "none";
                        cancelButton.style.display = "none";
                        editButton.style.display = "";
                    });
                    saveButton.style.display = "none";

                    const cancelButton = createButtonNode("Cancel", "secondary-button", () => {
                        typeSelect.value = currentType;
                        typeSelect.style.display = "none";
                        saveButton.style.display = "none";
                        cancelButton.style.display = "none";
                        editButton.style.display = "";
                    });
                    cancelButton.style.display = "none";

                    const editButton = createButtonNode("Edit", "secondary-button", () => {
                        typeSelect.style.display = "";
                        saveButton.style.display = "";
                        cancelButton.style.display = "";
                        editButton.style.display = "none";
                    });

                    actionsNode.appendChild(editButton);
                    actionsNode.appendChild(typeSelect);
                    actionsNode.appendChild(saveButton);
                    actionsNode.appendChild(cancelButton);
                    actionsNode.appendChild(createButtonNode("Remove", "danger-button", async () => {
                        await actions.removeBrandMember(brand.id, person.id);
                    }));
                }

                const item = createListItem(brand.name, "Brand", actionsNode);
                bindEntityNavigation(item, "brands", brand.id, async () => {
                    state.activeSection = "brands";
                    await actions.selectBrand(brand.id);
                });
                return item;
            },
            "No associated brands yet."
        );

        const availableBrands = state.data.brands.filter((brand) => !(associations.explicitBrandIds || []).includes(brand.id));
        const brandForm = createNode("form", { className: "inline-form" });
        const brandOptions = availableBrands.length
            ? availableBrands.map((brand) => ({ value: brand.id, label: brand.name }))
            : [{ value: "", label: "No available brands" }];
        brandForm.appendChild(createSelectNode(brandOptions, "", { name: "brand_id", disabled: availableBrands.length ? undefined : true }));

        const brandTypeSelect = createNode("select", { attrs: { name: "type" } });
        brandTypeSelect.appendChild(createNode("option", { attrs: { value: "" }, text: "(no type)" }));
        (state.data.typeLists.brandMembershipTypes || []).forEach((typeEntry) => {
            brandTypeSelect.appendChild(createNode("option", { attrs: { value: typeEntry.name }, text: typeEntry.name }));
        });
        brandForm.appendChild(brandTypeSelect);
        brandForm.appendChild(createButtonNode("Add", "primary-button", null, { type: "submit", disabled: !availableBrands.length }));
        brandForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const vals = createFormDataObject(brandForm);
            if (!vals.brand_id) return;
            await actions.addBrandMember(Number(vals.brand_id), person.id, vals.type || null);
        });
        const { wrapper: brandFormWrapper, trigger: brandFormTrigger } = wrapCollapsible("+ Add", brandForm);
        assocSection.appendChild(createNode("div", { className: "panel-heading", children: [createNode("h4", { text: "Brands" }), brandFormTrigger] }));
        assocSection.appendChild(brandFormWrapper);
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
                const personName = `${person.first_name} ${person.last_name || ""}`.trim();
                const avatar = createNode("span", {
                    className: "list-avatar",
                    text: getAvatarInitials(personName),
                    attrs: { title: personName, "aria-label": personName },
                });

                const item = createNode("div", {
                    className: `list-item${person.date_of_death ? " person-card--deceased" : ""}`,
                    children: [
                        createNode("div", {
                            className: "list-item__row",
                            children: [
                                createNode("div", {
                                    className: "list-item__main",
                                    children: [
                                        avatar,
                                        createNode("div", {
                                            className: "list-item__text",
                                            children: [titleNode, tagsNode],
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                });

                if (state.selected.personId === person.id) {
                    item.classList.add("active");
                }

                bindEntityNavigation(item, "people", person.id, async () => {
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
