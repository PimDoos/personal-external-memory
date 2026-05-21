export function formatDateTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatDate(value) {
    if (!value) {
        return "-";
    }

    if (typeof value === "string") {
        const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateOnlyMatch) {
            const year = Number(dateOnlyMatch[1]);
            const month = Number(dateOnlyMatch[2]);
            const day = Number(dateOnlyMatch[3]);
            const utcDate = new Date(Date.UTC(year, month - 1, day));
            return new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
            }).format(utcDate);
        }
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}

export function formatBirthday(value) {
    if (!value) {
        return "Unknown";
    }

    // Date-only strings should be rendered without timezone conversion.
    if (typeof value === "string") {
        const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateOnlyMatch) {
            const month = Number(dateOnlyMatch[2]);
            const day = Number(dateOnlyMatch[3]);
            const utcDate = new Date(Date.UTC(2000, month - 1, day));
            return new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
            }).format(utcDate);
        }
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
    }).format(date);
}

export function calculateAge(value) {
    if (!value) {
        return null;
    }

    const parsed = typeof value === "string"
        ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
        : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const today = new Date();
    let age = today.getUTCFullYear() - parsed.getUTCFullYear();
    const monthDelta = today.getUTCMonth() - parsed.getUTCMonth();
    const dayDelta = today.getUTCDate() - parsed.getUTCDate();
    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
        age -= 1;
    }
    return age;
}

export function calculateAgeAtDate(birthDate, endDate) {
    if (!birthDate || !endDate) {
        return null;
    }

    const parsedBirth = typeof birthDate === "string"
        ? new Date(`${String(birthDate).slice(0, 10)}T00:00:00Z`)
        : new Date(birthDate);
    const parsedEnd = typeof endDate === "string"
        ? new Date(`${String(endDate).slice(0, 10)}T00:00:00Z`)
        : new Date(endDate);
    if (Number.isNaN(parsedBirth.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return null;
    }

    let age = parsedEnd.getUTCFullYear() - parsedBirth.getUTCFullYear();
    const monthDelta = parsedEnd.getUTCMonth() - parsedBirth.getUTCMonth();
    const dayDelta = parsedEnd.getUTCDate() - parsedBirth.getUTCDate();
    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
        age -= 1;
    }
    return age;
}

export function toIsoDateTime(localValue) {
    if (!localValue) {
        return null;
    }

    // Preserve wall-clock time from datetime-local inputs.
    const normalized = String(localValue).trim();
    if (!normalized) {
        return null;
    }
    return normalized.length === 16 ? `${normalized}:00` : normalized;
}

export function toLocalDateTimeInputValue(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}