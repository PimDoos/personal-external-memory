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

export function getEntityAvatarPalette(entity) {
    if (entity === "brand") {
        return { fill: "#f0d5bc", stroke: "#b86a37" };
    }
    if (entity === "circle") {
        return { fill: "#ede0f5", stroke: "#8b5f9f" };
    }
    return { fill: "#d9ece0", stroke: "#588868" };
}