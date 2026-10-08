import { createNode } from "./dom.js";

const darkOpenFreeMapStylePromise = fetch(new URL("./map-styles/dark-openfreemap-override.json", import.meta.url))
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to load dark map style: ${response.status}`);
        }
        return response.json();
    })
    .catch((error) => {
        console.warn("Unable to load the dark OpenFreeMap style JSON.", error);
        return null;
    });

export async function getMapStyle(isDark) {
    if (!isDark) {
        return "https://tiles.openfreemap.org/styles/liberty";
    }

    return await darkOpenFreeMapStylePromise || "https://tiles.openfreemap.org/styles/dark";
}

export function summarizeLocationAssociations(associations) {
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

export function getLocationMarkerRules(summary) {
    const rules = [];
    if (summary?.hasPerson) {
        rules.push("person");
    }
    if (summary?.hasBrand) {
        rules.push("brand");
    }
    if (summary?.hasCircle) {
        rules.push("circle");
    }
    if (summary?.hasEvent) {
        rules.push("eventOnly");
    }
    return rules.length ? rules : ["fallback"];
}

export function getLocationMarkerRule(summary) {
    return getLocationMarkerRules(summary)[0];
}

export function createLocationMarkerIcon(leaflet, ruleKey, locationName, isCurrent = false) {
    const colorClassByRule = {
        person: "map-marker--person",
        brand: "map-marker--brand",
        circle: "map-marker--circle",
        eventOnly: "map-marker--event-only",
        fallback: "map-marker--fallback",
    };
    const colorClass = colorClassByRule[ruleKey] || colorClassByRule.fallback;
    const label = String(locationName || "Unnamed location");
    const currentClass = isCurrent ? " map-marker-icon--current" : "";

    return leaflet.divIcon({
        className: "map-marker-icon-wrapper",
        html: createNode("span", {
            className: `map-marker-icon ${colorClass}${currentClass}`,
            attrs: {
                title: label,
                "aria-label": label,
            },
        }).outerHTML,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
    });
}

export function addLocationRadiusLayer(leaflet, layer, location, coords, ruleKey) {
    return leaflet.circle([coords.lat, coords.lon], {
        radius: Number(location.radius) || 50,
        className: `location-radius location-radius--${ruleKey}`,
        fillOpacity: 0.14,
        opacity: 0.55,
        weight: 1,
        interactive: false,
    }).addTo(layer);
}