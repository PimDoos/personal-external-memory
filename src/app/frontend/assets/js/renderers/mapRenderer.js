import { clearNodeChildren, createNode } from "../dom.js";
import { api } from "../api.js";

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

export function createMapRenderer({ state, actions }) {
    let map = null;
    let markersLayer = null;
    let tileLayer = null;
    let tileTheme = null;
    let hasInitializedViewport = false;
    let wasMapSectionActive = false;
    const locationDetailCache = new Map();
    let locationDetailCacheVersion = "";
    const locationAssociationSummaryCache = new Map();
    const legendItems = [
        { key: "person", label: "Person", className: "map-marker--person" },
        { key: "brand", label: "Brand", className: "map-marker--brand" },
        { key: "circle", label: "Social circle", className: "map-marker--circle" },
        { key: "eventOnly", label: "Event", className: "map-marker--event-only" },
        { key: "fallback", label: "Other", className: "map-marker--fallback" },
    ];

    function computeLocationDetailCacheVersion() {
        const eventSignature = (state.data.events || [])
            .map((event) => {
                const locationIds = [...(event.location_ids || [])].sort((left, right) => left - right);
                return `${event.id}:${locationIds.join(",")}`;
            })
            .sort()
            .join("|");
        const locationSignature = (state.data.locations || [])
            .map((location) => `${location.id}:${location.updated_at || ""}`)
            .sort()
            .join("|");
        return `${eventSignature}::${locationSignature}`;
    }

    function refreshLocationDetailCacheIfNeeded() {
        const nextVersion = computeLocationDetailCacheVersion();
        if (nextVersion === locationDetailCacheVersion) {
            return;
        }
        locationDetailCacheVersion = nextVersion;
        locationDetailCache.clear();
        locationAssociationSummaryCache.clear();
    }

    function getLegendFilters() {
        if (!state.mapView.legendFilters) {
            state.mapView.legendFilters = {
                person: true,
                brand: true,
                circle: true,
                eventOnly: true,
                fallback: true,
            };
        }
        return state.mapView.legendFilters;
    }

    function prefersDarkScheme() {
        return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    function getTileConfig(isDark) {
        if (isDark) {
            return {
                url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            };
        }

        return {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        };
    }

    function ensureTileLayer() {
        if (!map || !window.L) {
            return;
        }

        const isDark = prefersDarkScheme();
        const nextTheme = isDark ? "dark" : "light";
        if (tileLayer && tileTheme === nextTheme) {
            return;
        }

        if (tileLayer) {
            map.removeLayer(tileLayer);
        }

        const config = getTileConfig(isDark);
        tileLayer = window.L.tileLayer(config.url, {
            attribution: config.attribution,
            maxZoom: 19,
        }).addTo(map);
        tileTheme = nextTheme;
    }

    function ensureMap(canvas) {
        if (map || typeof window === "undefined" || !window.L) {
            return;
        }

        map = window.L.map(canvas, {
            zoomControl: true,
            minZoom: 2,
        }).setView([20, 0], 2);

        ensureTileLayer();

        if (window.matchMedia) {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            mediaQuery.addEventListener("change", () => {
                ensureTileLayer();
            });
        }

        markersLayer = window.L.layerGroup().addTo(map);
    }

    function getEntityLabel(entityType, entityId) {
        if (entityType === "person") {
            const person = state.data.people.find((entry) => entry.id === entityId);
            return person ? `${person.first_name || ""} ${person.last_name || ""}`.trim() : `Person #${entityId}`;
        }
        if (entityType === "social_circle") {
            const circle = state.data.circles.find((entry) => entry.id === entityId);
            return circle ? circle.name : `Circle #${entityId}`;
        }
        if (entityType === "brand") {
            const brand = state.data.brands.find((entry) => entry.id === entityId);
            return brand ? brand.name : `Brand #${entityId}`;
        }
        if (entityType === "event") {
            const event = state.data.events.find((entry) => entry.id === entityId);
            return event ? (event.title || `Event #${entityId}`) : `Event #${entityId}`;
        }
        return `${entityType} #${entityId}`;
    }

    function getEventSortTimestamp(eventId) {
        const event = state.data.events.find((entry) => entry.id === eventId);
        if (!event) {
            return Number.NEGATIVE_INFINITY;
        }

        const timestamp = new Date(event.start_time || event.date || 0).getTime();
        return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
    }

    function formatEventDateForLink(eventId) {
        const event = state.data.events.find((entry) => entry.id === eventId);
        if (!event) {
            return "";
        }

        const date = new Date(event.start_time || event.date || 0);
        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(date);
    }

    function formatEntityTypeLabel(entityType) {
        if (entityType === "social_circle") {
            return "Circles";
        }
        if (entityType === "person") {
            return "People";
        }
        if (entityType === "brand") {
            return "Brands";
        }
        if (entityType === "event") {
            return "Events";
        }
        return entityType;
    }

    async function openEntityFromAssociation(entityType, entityId) {
        if (!Number.isInteger(entityId) || entityId <= 0) {
            return;
        }

        if (entityType === "person") {
            await actions.openPersonFromContext(entityId);
            return;
        }
        if (entityType === "social_circle") {
            state.activeSection = "circles";
            await actions.selectCircle(entityId);
            return;
        }
        if (entityType === "brand") {
            await actions.openBrandFromContext(entityId);
            return;
        }
        if (entityType === "event") {
            await actions.openEventFromContext(entityId);
        }
    }

    function buildAssociationsContent(associations, onAssociationClick) {
        if (!Array.isArray(associations) || !associations.length) {
            return createNode("div", {
                className: "map-popup-associations__empty",
                text: "No associated entities.",
            });
        }

        const grouped = new Map();
        associations.forEach((association) => {
            const groupKey = association.entity_type;
            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, []);
            }
            grouped.get(groupKey).push({
                entityId: association.entity_id,
                label: getEntityLabel(association.entity_type, association.entity_id),
            });
        });

        const associationsNode = createNode("div", {
            className: "map-popup-associations",
        });

        grouped.forEach((entries, entityType) => {
            let sortedEntries = [...entries];
            if (entityType === "event") {
                sortedEntries = sortedEntries
                    .sort((left, right) => getEventSortTimestamp(right.entityId) - getEventSortTimestamp(left.entityId))
                    .slice(0, 3)
                    .map((entry) => {
                        const eventDate = formatEventDateForLink(entry.entityId);
                        const datedLabel = eventDate ? `${entry.label} (${eventDate})` : entry.label;
                        return { ...entry, label: datedLabel };
                    });
            } else {
                sortedEntries = sortedEntries
                    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
            }

            const listNode = createNode("ul");
            sortedEntries.forEach((entry) => {
                const entityId = Number(entry.entityId || 0);
                const buttonNode = createNode("button", {
                    className: "map-popup-association-link",
                    text: entry.label,
                    attrs: { type: "button" },
                    dataset: {
                        entityType,
                        entityId,
                    },
                });
                buttonNode.addEventListener("click", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    await onAssociationClick(entityType, entityId);
                });

                listNode.appendChild(createNode("li", { children: [buttonNode] }));
            });

            associationsNode.appendChild(
                createNode("div", {
                    className: "map-popup-associations__group",
                    children: [
                        createNode("strong", { text: formatEntityTypeLabel(entityType) }),
                        listNode,
                    ],
                })
            );
        });

        return associationsNode;
    }

    function buildPopupBody(title, type, rawLocation, associationsContent) {
        return createNode("div", {
            children: [
                createNode("strong", { text: title }),
                createNode("br"),
                createNode("span", { text: type }),
                createNode("br"),
                createNode("small", { text: rawLocation || "" }),
                createNode("hr"),
                associationsContent,
            ],
        });
    }

    function buildMarkerIconHtml(colorClass, colorLabel) {
        return createNode("span", {
            className: `map-marker-icon ${colorClass}`,
            attrs: {
                title: colorLabel,
                "aria-label": colorLabel,
            },
        }).outerHTML;
    }

    async function getLocationDetail(locationId) {
        if (locationDetailCache.has(locationId)) {
            return locationDetailCache.get(locationId);
        }

        const fromList = (state.data.locations || []).find((location) => Number(location.id) === Number(locationId));
        if (fromList && Array.isArray(fromList.associations)) {
            locationDetailCache.set(locationId, fromList);
            return fromList;
        }

        const detail = await api.locations.get(locationId);
        locationDetailCache.set(locationId, detail);
        return detail;
    }

    function summarizeAssociationTypes(associations) {
        const summary = {
            hasPerson: false,
            hasBrand: false,
            hasCircle: false,
            hasEvent: false,
        };

        (associations || []).forEach((association) => {
            if (association.entity_type === "person") {
                summary.hasPerson = true;
            } else if (association.entity_type === "brand") {
                summary.hasBrand = true;
            } else if (association.entity_type === "social_circle") {
                summary.hasCircle = true;
            } else if (association.entity_type === "event") {
                summary.hasEvent = true;
            }
        });

        return summary;
    }

    function getMarkerColorClass(summary) {
        if (summary?.hasPerson) {
            return "map-marker--person";
        }
        if (summary?.hasBrand) {
            return "map-marker--brand";
        }
        if (summary?.hasCircle) {
            return "map-marker--circle";
        }
        if (summary?.hasEvent) {
            return "map-marker--event-only";
        }
        return "map-marker--fallback";
    }

    function getMarkerColorLabel(summary) {
        if (summary?.hasPerson) {
            return "Has people";
        }
        if (summary?.hasBrand) {
            return "Has brands";
        }
        if (summary?.hasCircle) {
            return "Has circles";
        }
        if (summary?.hasEvent) {
            return "Only events";
        }
        return "Unassociated";
    }

    function getMarkerRuleKey(summary) {
        if (summary?.hasPerson) {
            return "person";
        }
        if (summary?.hasBrand) {
            return "brand";
        }
        if (summary?.hasCircle) {
            return "circle";
        }
        if (summary?.hasEvent) {
            return "eventOnly";
        }
        return "fallback";
    }

    function selectMarkerRule(summary, filters) {
        const candidates = [];
        if (summary?.hasPerson) {
            candidates.push("person");
        }
        if (summary?.hasBrand) {
            candidates.push("brand");
        }
        if (summary?.hasCircle) {
            candidates.push("circle");
        }
        if (summary?.hasEvent) {
            candidates.push("eventOnly");
        }
        if (!candidates.length) {
            candidates.push("fallback");
        }

        return candidates.find((key) => Boolean(filters[key])) || null;
    }

    function buildMarkerIcon(locationId) {
        const summary = locationAssociationSummaryCache.get(locationId) || summarizeAssociationTypes([]);
        const colorClass = getMarkerColorClass(summary);
        const colorLabel = getMarkerColorLabel(summary);
        return window.L.divIcon({
            className: "map-marker-icon-wrapper",
            html: buildMarkerIconHtml(colorClass, colorLabel),
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [0, -10],
        });
    }

    function buildMarkerIconFromRule(ruleKey) {
        const colorClassByRule = {
            person: "map-marker--person",
            brand: "map-marker--brand",
            circle: "map-marker--circle",
            eventOnly: "map-marker--event-only",
            fallback: "map-marker--fallback",
        };
        const colorLabelByRule = {
            person: "Has people",
            brand: "Has brands",
            circle: "Has circles",
            eventOnly: "Only events",
            fallback: "Unassociated",
        };
        const colorClass = colorClassByRule[ruleKey] || "map-marker--fallback";
        const colorLabel = colorLabelByRule[ruleKey] || "Unassociated";
        return window.L.divIcon({
            className: "map-marker-icon-wrapper",
            html: buildMarkerIconHtml(colorClass, colorLabel),
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [0, -10],
        });
    }

    function renderLegend(legendNode) {
        clearNodeChildren(legendNode);
        const filters = getLegendFilters();

        legendItems.forEach((item) => {
            const isActive = Boolean(filters[item.key]);
            const button = createNode("button", {
                className: `map-legend__item${isActive ? "" : " is-inactive"}`,
                attrs: {
                    type: "button",
                    "aria-pressed": String(isActive),
                    title: isActive ? `Hide ${item.label}` : `Show ${item.label}`,
                },
                children: [
                    createNode("span", {
                        className: `map-marker-icon ${item.className}`,
                        attrs: { "aria-hidden": "true" },
                    }),
                    createNode("span", { text: item.label }),
                ],
            });

            button.addEventListener("click", () => {
                filters[item.key] = !filters[item.key];
                renderMap();
            });

            legendNode.appendChild(button);
        });
    }

    function displayLocationLabel(location) {
        return location.label || location.location || `Location #${location.id}`;
    }

    function renderUnmappedLocationsPanel(unmappedNode, unmappedLocations) {
        clearNodeChildren(unmappedNode);

        if (!unmappedLocations.length) {
            return;
        }

        const panel = createNode("details", { className: "map-unmapped-panel" });
        const locationCount = unmappedLocations.length;
        const summaryLabel = `${locationCount} location${locationCount === 1 ? "" : "s"} not shown`;

        const summary = createNode("summary", {
            className: "map-unmapped-panel__summary",
            children: [
                createNode("span", { className: "map-unmapped-panel__title", text: summaryLabel }),
                createNode("span", { className: "map-unmapped-panel__chevron", text: "˅", attrs: { "aria-hidden": "true" } }),
            ],
        });
        panel.appendChild(summary);

        const list = createNode("ul", { className: "map-unmapped-panel__list" });
        unmappedLocations
            .slice()
            .sort((left, right) => {
                return displayLocationLabel(left).localeCompare(displayLocationLabel(right), undefined, {
                    sensitivity: "base",
                });
            })
            .forEach((location) => {
                const button = createNode("button", {
                    className: "map-unmapped-panel__link",
                    text: displayLocationLabel(location),
                    attrs: { type: "button" },
                });
                button.addEventListener("click", async () => {
                    state.activeSection = "locations";
                    await actions.selectLocation(location.id);
                });

                const listItem = createNode("li", {
                    children: [button],
                });
                list.appendChild(listItem);
            });

        panel.appendChild(list);
        unmappedNode.appendChild(panel);
    }

    function renderMap() {
        const canvas = document.getElementById("map-canvas");
        const unmappedNode = document.getElementById("map-unmapped");
        const legendNode = document.querySelector(".map-legend");
        if (!canvas || !unmappedNode || !legendNode) {
            return;
        }

        renderLegend(legendNode);

        refreshLocationDetailCacheIfNeeded();

        if (!window.L) {
            clearNodeChildren(unmappedNode);
            unmappedNode.textContent = "Map library failed to load.";
            clearNodeChildren(canvas);
            canvas.appendChild(createNode("div", { className: "empty-state", text: "Map is unavailable." }));
            return;
        }

        ensureMap(canvas);
        if (!map || !markersLayer) {
            return;
        }

        ensureTileLayer();

        markersLayer.clearLayers();

        const plottable = [];
        const unmapped = [];
        const filters = getLegendFilters();
        state.data.locations.forEach((location) => {
            const coords = (Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
                ? { lat: Number(location.latitude), lon: Number(location.longitude) }
                : parseCoordinates(location.location);
            if (!coords) {
                unmapped.push(location);
                return;
            }

            const summary = locationAssociationSummaryCache.get(location.id) || summarizeAssociationTypes([]);
            const markerRule = selectMarkerRule(summary, filters);
            if (!markerRule) {
                return;
            }

            plottable.push({ location, coords, markerRule });
        });

        plottable.forEach(({ location, coords, markerRule }) => {
            const title = location.label || location.location || `Location #${location.id}`;
            const type = location.location_type || "Unknown";
            const preloadedAssociations = Array.isArray(location.associations) ? location.associations : null;
            if (preloadedAssociations) {
                locationAssociationSummaryCache.set(location.id, summarizeAssociationTypes(preloadedAssociations));
            }
            const marker = window.L.marker([coords.lat, coords.lon], {
                icon: buildMarkerIconFromRule(markerRule),
            });

            marker.bindPopup(
                buildPopupBody(
                    title,
                    type,
                    location.location,
                    preloadedAssociations
                        ? buildAssociationsContent(preloadedAssociations, openEntityFromAssociation)
                        : createNode("div", {
                            className: "map-popup-associations__loading",
                            text: "Loading associations...",
                        })
                )
            );
            marker.on("popupopen", async () => {
                const popup = marker.getPopup();
                if (!popup) {
                    return;
                }

                 if (preloadedAssociations) {
                    popup.setContent(
                        buildPopupBody(
                            title,
                            type,
                            location.location,
                            buildAssociationsContent(preloadedAssociations, openEntityFromAssociation)
                        )
                    );
                    return;
                }

                try {
                    const detail = await getLocationDetail(location.id);
                    locationAssociationSummaryCache.set(location.id, summarizeAssociationTypes(detail.associations || []));
                    popup.setContent(
                        buildPopupBody(
                            title,
                            type,
                            location.location,
                            buildAssociationsContent(detail.associations || [], openEntityFromAssociation)
                        )
                    );
                } catch {
                    popup.setContent(
                        buildPopupBody(
                            title,
                            type,
                            location.location,
                            createNode("div", {
                                className: "map-popup-associations__error",
                                text: "Could not load associations.",
                            })
                        )
                    );
                }
            });
            marker.addTo(markersLayer);
        });

        const focusTarget = state.mapView?.focusTarget;
        const isMapSectionActive = state.activeSection === "map";
        const enteredMapSection = isMapSectionActive && !wasMapSectionActive;

        if (isMapSectionActive) {
            map.invalidateSize();
        }

        const fitAllPlottable = () => {
            if (plottable.length) {
                const bounds = window.L.latLngBounds(plottable.map((entry) => [entry.coords.lat, entry.coords.lon]));
                map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
            } else {
                map.setView([20, 0], 2);
            }
        };

        if (focusTarget && Number.isFinite(focusTarget.lat) && Number.isFinite(focusTarget.lon)) {
            const zoom = Number.isFinite(focusTarget.zoom) ? focusTarget.zoom : 16;
            map.setView([focusTarget.lat, focusTarget.lon], zoom);
            state.mapView.focusTarget = null;
            hasInitializedViewport = true;
        } else if (enteredMapSection) {
            window.requestAnimationFrame(() => {
                if (state.activeSection !== "map") {
                    return;
                }
                map.invalidateSize();
                fitAllPlottable();
            });
            hasInitializedViewport = true;
        } else if (!hasInitializedViewport) {
            fitAllPlottable();
            hasInitializedViewport = true;
        }

        if (state.data.locations.length) {
            renderUnmappedLocationsPanel(unmappedNode, unmapped);
        } else {
            clearNodeChildren(unmappedNode);
            unmappedNode.textContent = "No locations yet.";
        }

        wasMapSectionActive = isMapSectionActive;
    }

    return { renderMap };
}
