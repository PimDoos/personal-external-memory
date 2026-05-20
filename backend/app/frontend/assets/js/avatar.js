import { createNode } from "./dom.js";

export function getAvatarInitials(label) {
    const initials = String(label || "")
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    return initials || "?";
}

/**
 * Create a person avatar node.
 *
 * If `faceIdentityId` is provided, renders an `<img>` that loads the Immich
 * face thumbnail asynchronously.  Falls back to an initials `<span>` when
 * no face is linked or the image cannot be loaded.
 *
 * @param {string} personName  - Display name used for initials / aria-label.
 * @param {number|null} faceIdentityId - Internal external-identity row id.
 * @param {Function|null} resolveImageUrl - `actions.resolveImmichFaceImageUrl`.
 * @param {string} [className="list-avatar"] - CSS class (`list-avatar` or `dashboard-avatar`).
 * @returns {HTMLElement}
 */
export function createPersonAvatar(personName, faceIdentityId, resolveImageUrl, className = "list-avatar") {
    const attrs = { title: personName, "aria-label": personName };

    if (faceIdentityId && resolveImageUrl) {
        const img = createNode("img", {
            className,
            attrs: {
                src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
                alt: personName,
                loading: "lazy",
                title: personName,
                "aria-label": personName,
            },
        });

        resolveImageUrl(faceIdentityId).then((url) => {
            if (url) {
                img.src = url;
            } else {
                img.replaceWith(createNode("span", { className, text: getAvatarInitials(personName), attrs }));
            }
        }).catch(() => {
            img.replaceWith(createNode("span", { className, text: getAvatarInitials(personName), attrs }));
        });

        return img;
    }

    return createNode("span", { className, text: getAvatarInitials(personName), attrs });
}

export function getEntityAvatarPalette(entity) {
    if (entity === "brand") {
        return { fill: "#f0d5bc", stroke: "#b86a37" };
    }
    if (entity === "circle") {
        return { fill: "#ede0f5", stroke: "#8b5f9f" };
    }
    return { fill: "#d9ece0", stroke: "#588868" };
}