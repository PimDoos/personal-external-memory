import { clearNodeChildren, createNode } from "../dom.js";
import { api } from "../api.js";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

export function createMapRenderer({ state, actions }) {
    let map = null;
    let markersLayer = null;
    let tileLayer = null;
    let tileTheme = null;
    const locationDetailCache = new Map();
    let locationDetailCacheVersion = "";
    const locationAssociationSummaryCache = new Map();
    const locationAssociationSummaryInFlight = new Map();
    let rerenderQueued = false;

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
        locationAssociationSummaryInFlight.clear();
    }

    function requestRerender() {
        if (rerenderQueued) {
            return;
        }

        rerenderQueued = true;
        window.setTimeout(() => {
            rerenderQueued = false;
            renderMap();
        }, 0);
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

    function buildAssociationsHtml(associations) {
        if (!Array.isArray(associations) || !associations.length) {
            return "<div class=\"map-popup-associations__empty\">No associated entities.</div>";
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

        const sections = [];
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

            const items = sortedEntries
                .map((entry) => {
                    return `<li><button type=\"button\" class=\"map-popup-association-link\" data-entity-type=\"${escapeHtml(entityType)}\" data-entity-id=\"${Number(entry.entityId || 0)}\">${escapeHtml(entry.label)}</button></li>`;
                })
                .join("");
            sections.push(
                `<div class=\"map-popup-associations__group\"><strong>${escapeHtml(formatEntityTypeLabel(entityType))}</strong><ul>${items}</ul></div>`
            );
        });

        return `<div class=\"map-popup-associations\">${sections.join("")}</div>`;
    }

    async function getLocationDetail(locationId) {
        if (locationDetailCache.has(locationId)) {
            return locationDetailCache.get(locationId);
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

    async function ensureLocationAssociationSummary(locationId) {
        if (locationAssociationSummaryCache.has(locationId)) {
            return locationAssociationSummaryCache.get(locationId);
        }

        if (locationAssociationSummaryInFlight.has(locationId)) {
            return locationAssociationSummaryInFlight.get(locationId);
        }

        const pending = getLocationDetail(locationId)
            .then((detail) => {
                const summary = summarizeAssociationTypes(detail.associations || []);
                locationAssociationSummaryCache.set(locationId, summary);
                return summary;
            })
            .catch(() => {
                const fallback = summarizeAssociationTypes([]);
                locationAssociationSummaryCache.set(locationId, fallback);
                return fallback;
            })
            .finally(() => {
                locationAssociationSummaryInFlight.delete(locationId);
            });

        locationAssociationSummaryInFlight.set(locationId, pending);
        return pending;
    }

    function buildMarkerIcon(locationId) {
        const summary = locationAssociationSummaryCache.get(locationId) || summarizeAssociationTypes([]);
        const colorClass = getMarkerColorClass(summary);
        const colorLabel = getMarkerColorLabel(summary);
        return window.L.divIcon({
            className: "map-marker-icon-wrapper",
            html: `<span class="map-marker-icon ${colorClass}" title="${escapeHtml(colorLabel)}" aria-label="${escapeHtml(colorLabel)}"></span>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [0, -10],
        });
    }

    function renderMap() {
        const canvas = document.getElementById("map-canvas");
        const unmappedNode = document.getElementById("map-unmapped");
        if (!canvas || !unmappedNode) {
            return;
        }

        refreshLocationDetailCacheIfNeeded();

        if (!window.L) {
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
        state.data.locations.forEach((location) => {
            const coords = (Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
                ? { lat: Number(location.latitude), lon: Number(location.longitude) }
                : parseCoordinates(location.location);
            if (!coords) {
                unmapped.push(location);
                return;
            }
            plottable.push({ location, coords });
        });

        plottable.forEach(({ location, coords }) => {
            const title = location.label || location.location || `Location #${location.id}`;
            const type = location.location_type || "Unknown";
            const marker = window.L.marker([coords.lat, coords.lon], {
                icon: buildMarkerIcon(location.id),
            });

            if (!locationAssociationSummaryCache.has(location.id)) {
                ensureLocationAssociationSummary(location.id).then(() => {
                    requestRerender();
                });
            }

            marker.bindPopup(
                `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(type)}<br><small>${escapeHtml(location.location || "")}</small><hr><div class=\"map-popup-associations__loading\">Loading associations...</div>`
            );
            marker.on("popupopen", async () => {
                const popup = marker.getPopup();
                if (!popup) {
                    return;
                }

                try {
                    const detail = await getLocationDetail(location.id);
                    locationAssociationSummaryCache.set(location.id, summarizeAssociationTypes(detail.associations || []));
                    const associationsHtml = buildAssociationsHtml(detail.associations || []);
                    popup.setContent(
                        `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(type)}<br><small>${escapeHtml(location.location || "")}</small><hr>${associationsHtml}`
                    );

                    const popupNode = popup.getElement();
                    if (popupNode) {
                        popupNode.querySelectorAll(".map-popup-association-link").forEach((node) => {
                            node.addEventListener("click", async (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const entityType = String(node.getAttribute("data-entity-type") || "");
                                const entityId = Number(node.getAttribute("data-entity-id") || 0);
                                await openEntityFromAssociation(entityType, entityId);
                            });
                        });
                    }
                } catch {
                    popup.setContent(
                        `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(type)}<br><small>${escapeHtml(location.location || "")}</small><hr><div class=\"map-popup-associations__error\">Could not load associations.</div>`
                    );
                }
            });
            marker.addTo(markersLayer);
        });

        if (plottable.length) {
            const bounds = window.L.latLngBounds(plottable.map((entry) => [entry.coords.lat, entry.coords.lon]));
            map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
            unmappedNode.textContent = unmapped.length
                ? `${unmapped.length} location(s) not shown: add coordinates like "52.3676, 4.9041".`
                : "";
        } else {
            map.setView([20, 0], 2);
            unmappedNode.textContent = state.data.locations.length
                ? "No mappable coordinates found. Use formats like \"52.3676, 4.9041\" or \"POINT(4.9041 52.3676)\"."
                : "No locations yet.";
        }

        if (state.activeSection === "map") {
            map.invalidateSize();
        }
    }

    return { renderMap };
}
