import { clearNodeChildren, createButtonNode, createFormDataObject, createNode, createSelectNode } from "../dom.js";
import { formatDateTime } from "../ui.js";

export function createLocationsRenderer({ state, caches, actions, common }) {
    const { filtered, createEventCard, createListItem, renderSimpleList } = common;

    function hasImmichIntegrationConfigured() {
        const settings = state.data.userSettings || {};
        const apiKey = String(settings.immich_api_key || "").trim();
        const baseUrl = String(settings.immich_base_url || "").trim();
        return Boolean(apiKey && baseUrl);
    }

    function parseCoordinates(rawLocation) {
        const value = String(rawLocation || "").trim();
        if (!value) {
            return null;
        }

        const wktPoint = value.match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
        if (wktPoint) {
            const lon = Number(wktPoint[1]);
            const lat = Number(wktPoint[2]);
            if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                return { lat, lon };
            }
        }

        const matches = value.match(/-?\d+(?:\.\d+)?/g);
        if (!matches || matches.length < 2) {
            return null;
        }

        const first = Number(matches[0]);
        const second = Number(matches[1]);
        if (!Number.isFinite(first) || !Number.isFinite(second)) {
            return null;
        }

        const firstCanBeLat = Math.abs(first) <= 90;
        const firstCanBeLon = Math.abs(first) <= 180;
        const secondCanBeLat = Math.abs(second) <= 90;
        const secondCanBeLon = Math.abs(second) <= 180;

        if (firstCanBeLat && secondCanBeLon) {
            return { lat: first, lon: second };
        }
        if (firstCanBeLon && secondCanBeLat) {
            return { lat: second, lon: first };
        }

        return null;
    }

    function inferLocationCoordinates(location) {
        const lat = Number(location.latitude);
        const lon = Number(location.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
        }
        return parseCoordinates(location.location);
    }

    function formatCoordinates(coords) {
        if (!coords) {
            return "unable to resolve coordinates";
        }
        return `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;
    }

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

    function resolveAssociatedEntity(association) {
        switch (association.entity_type) {
            case "person": {
                const person = state.data.people.find((entry) => entry.id === association.entity_id);
                return person
                    ? {
                        section: "people",
                        title: `${person.first_name} ${person.last_name || ""}`.trim(),
                        subtitle: "Person",
                        open: async () => {
                            state.activeSection = "people";
                            await actions.selectPerson(person.id);
                        },
                    }
                    : null;
            }
            case "social_circle": {
                const circle = state.data.circles.find((entry) => entry.id === association.entity_id);
                return circle
                    ? {
                        section: "circles",
                        title: circle.name,
                        subtitle: "Circle",
                        open: async () => {
                            state.activeSection = "circles";
                            await actions.selectCircle(circle.id);
                        },
                    }
                    : null;
            }
            case "brand": {
                const brand = state.data.brands.find((entry) => entry.id === association.entity_id);
                return brand
                    ? {
                        section: "brands",
                        title: brand.name,
                        subtitle: "Brand",
                        open: async () => {
                            state.activeSection = "brands";
                            await actions.selectBrand(brand.id);
                        },
                    }
                    : null;
            }
            case "event": {
                const event = state.data.events.find((entry) => entry.id === association.entity_id);
                return event
                    ? {
                        section: "events",
                        event,
                        title: event.title || `Event #${event.id}`,
                        subtitle: `Event · ${formatDateTime(event.start_time || event.date)}`,
                        eventStartTimestamp: new Date(event.start_time || event.date || 0).getTime(),
                        open: async () => {
                            state.activeSection = "events";
                            await actions.selectEvent(event.id);
                        },
                    }
                    : null;
            }
            default:
                return null;
        }
    }

    function buildLocationEditForm(location) {
        const form = createNode("form", { className: "form-grid compact-form" });
        const inferredCoordinates = inferLocationCoordinates(location);

        const labelInput = createNode("input", {
            value: location.label || "",
            attrs: { name: "label", placeholder: "Optional label" },
        });

        const locationInput = createNode("input", {
            value: location.location || "",
            attrs: { name: "location", required: true, placeholder: "Address or coordinates" },
        });

        const typeInput = createSelectNode(
            getLocationTypeOptions(location.location_type || ""),
            location.location_type || getLocationTypeOptions()[0]?.value || "",
            { name: "location_type", required: true, disabled: !((state.data.typeLists.locationTypes || []).length && getLocationTypeOptions(location.location_type || "").length) }
        );

        form.appendChild(createNode("label", {
            children: [
                createNode("span", { text: "Address or Coordinates" }),
                locationInput,
            ],
        }));

        const mapButton = createNode("button", {
            className: "secondary-button",
            text: "Show on map",
            attrs: { type: "button" },
        });
        mapButton.disabled = !inferredCoordinates;
        mapButton.addEventListener("click", async () => {
            if (!inferredCoordinates) {
                return;
            }
            await actions.openMapAtCoordinates({
                lat: inferredCoordinates.lat,
                lon: inferredCoordinates.lon,
                zoom: 16,
            });
        });

        form.appendChild(createNode("div", {
            className: "location-coordinates-row",
            children: [
                createNode("p", {
                    className: "muted",
                    text: `Inferred coordinates: ${formatCoordinates(inferredCoordinates)}`,
                }),
                mapButton,
            ],
        }));

        form.appendChild(createNode("label", {
            children: [
                createNode("span", { text: "Type" }),
                typeInput,
            ],
        }));

        form.appendChild(createNode("label", {
            children: [
                createNode("span", { text: "Optional label" }),
                labelInput,
            ],
        }));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(form);
            if (payload.label === "") {
                payload.label = null;
            }
            if (payload.location_type === "") {
                payload.location_type = null;
            }
            await actions.updateLocation(location.id, payload);
        });

        return form;
    }

    function buildImmichGallerySection(items, onRefresh) {
        const section = createNode("section", { className: "subpanel" });
        section.appendChild(createNode("div", {
            className: "panel-heading",
            children: [
                createNode("h3", { text: "Immich Gallery" }),
                createButtonNode("Refresh", "secondary-button", async () => {
                    await onRefresh();
                }),
            ],
        }));

        const grid = createNode("div", { className: "immich-gallery" });
        if (!items.length) {
            grid.appendChild(createNode("p", {
                className: "muted",
                text: "No photos found for events associated with this location.",
            }));
        } else {
            items.forEach((item) => {
                const imageUrl = item.preview_url || item.thumbnail_url || "";
                const title = item.created_at
                    ? `Taken ${formatDateTime(item.created_at)}`
                    : (item.type || "Immich asset");
                const card = createNode("a", {
                    className: "immich-gallery__item",
                    attrs: {
                        href: item.immich_url || "#",
                        target: "_blank",
                        rel: "noopener noreferrer",
                        title,
                    },
                });

                if (imageUrl) {
                    const imageNode = createNode("img", {
                        className: "immich-gallery__image",
                        attrs: {
                            src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
                            alt: title,
                            loading: "lazy",
                        },
                    });
                    card.appendChild(imageNode);
                    actions.resolveImmichImageUrl(item).then((resolvedUrl) => {
                        if (resolvedUrl) {
                            imageNode.src = resolvedUrl;
                        } else {
                            imageNode.remove();
                            card.appendChild(createNode("span", {
                                className: "immich-gallery__fallback",
                                text: "Open in Immich",
                            }));
                        }
                    }).catch(() => {
                        imageNode.remove();
                        card.appendChild(createNode("span", {
                            className: "immich-gallery__fallback",
                            text: "Open in Immich",
                        }));
                    });
                } else {
                    card.appendChild(createNode("span", {
                        className: "immich-gallery__fallback",
                        text: "Open in Immich",
                    }));
                }

                grid.appendChild(card);
            });
        }
        section.appendChild(grid);
        return section;
    }

    function renderLocationDetail() {
        const panel = document.getElementById("location-detail-panel");
        const form = document.getElementById("location-form");
        const container = document.getElementById("location-detail");
        const mode = state.sidebar.locations;

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

        const location = state.data.locations.find((entry) => entry.id === state.selected.locationId);
        if (!location) {
            panel.classList.add("hidden");
            return;
        }

        const associations = caches.locationAssociations.get(location.id) || [];
        const immichGalleryItems = caches.immichLocationGallery.get(location.id) || [];
        const immichConfigured = hasImmichIntegrationConfigured();
        const associationsWithIndex = associations.map((association, index) => ({ association, index }));
        associationsWithIndex.sort((left, right) => {
            const leftEntity = resolveAssociatedEntity(left.association);
            const rightEntity = resolveAssociatedEntity(right.association);
            const leftIsEvent = left.association.entity_type === "event";
            const rightIsEvent = right.association.entity_type === "event";

            if (leftIsEvent && rightIsEvent) {
                const leftTime = leftEntity?.eventStartTimestamp || Number.POSITIVE_INFINITY;
                const rightTime = rightEntity?.eventStartTimestamp || Number.POSITIVE_INFINITY;
                if (leftTime !== rightTime) {
                    return leftTime - rightTime;
                }
            }

            return left.index - right.index;
        });
        const sortedAssociations = associationsWithIndex.map((entry) => entry.association);

        clearNodeChildren(container);
        container.className = "detail-grid";
        const locationEditForm = buildLocationEditForm(location);
        const saveLocationButton = createButtonNode("Save", "primary-button", () => {
            locationEditForm.requestSubmit();
        }, { type: "button" });

        container.appendChild(createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [
                        createNode("h3", { text: "Location Details" }),
                        createNode("div", {
                            className: "list-actions",
                            children: [
                                saveLocationButton,
                                createButtonNode("Delete", "danger-button", async () => {
                                    await actions.deleteLocation(location.id);
                                }),
                            ],
                        }),
                    ],
                }),
                locationEditForm,
            ],
        }));

        const associatedEntitiesPanel = createNode("article", {
            className: "subpanel",
            children: [
                createNode("div", {
                    className: "panel-heading",
                    children: [createNode("h3", { text: "Associated Entities" })],
                }),
            ],
        });

        const associationsList = createNode("div", { className: "list" });
        renderSimpleList(
            associationsList,
            sortedAssociations,
            (association) => {
                const entity = resolveAssociatedEntity(association);
                if (!entity) {
                    return createListItem(`Unknown #${association.entity_id}`, association.entity_type);
                }

                const item = entity.section === "events" && entity.event
                    ? createEventCard(entity.event)
                    : createListItem(entity.title, entity.subtitle);
                bindEntityNavigation(item, entity.section, association.entity_id, entity.open);
                return item;
            },
            "No associated entities."
        );
        associatedEntitiesPanel.appendChild(associationsList);
        container.appendChild(associatedEntitiesPanel);
        if (immichConfigured) {
            container.appendChild(buildImmichGallerySection(immichGalleryItems, async () => {
                await actions.refreshImmichLocationGallery(location.id);
            }));
        }
    }

    function renderLocations() {
        const list = document.getElementById("locations-list");
        if (!list) {
            return;
        }

        const filteredLocations = filtered(
            "locations",
            state.data.locations || [],
            (location) => location.label,
            (location) => location.location,
            (location) => location.location_type
        );

        clearNodeChildren(list);
        renderSimpleList(
            list,
            filteredLocations,
            (location) => {
                const subtitle = location.location_type ? `${location.location_type} • ${location.location}` : location.location;
                const item = createListItem(displayLocationLabel(location), subtitle);
                bindEntityNavigation(item, "locations", location.id, async () => {
                    await actions.selectLocation(location.id);
                });
                return item;
            },
            "No locations yet"
        );

        renderLocationDetail();
    }

    function attachFormHandler() {
        const locationForm = document.getElementById("location-form");
        if (!locationForm) {
            return;
        }

        const typeSelect = locationForm.querySelector("select[name='location_type']");
        if (typeSelect) {
            clearNodeChildren(typeSelect);
            getLocationTypeOptions().forEach((option) => {
                typeSelect.appendChild(createNode("option", {
                    text: option.label,
                    attrs: { value: option.value },
                }));
            });
            typeSelect.disabled = !(state.data.typeLists.locationTypes || []).length;
        }

        if (locationForm.dataset.bound === "true") {
            return;
        }

        locationForm.dataset.bound = "true";
        locationForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = createFormDataObject(locationForm);
            if (payload.label === "") {
                payload.label = null;
            }
            if (payload.location_type === "") {
                payload.location_type = null;
            }
            await actions.createLocation(payload);
        });
    }

    return {
        renderLocations: () => {
            renderLocations();
            attachFormHandler();
        },
    };
}
