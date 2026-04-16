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

export function toIsoDateTime(localValue) {
    return localValue ? new Date(localValue).toISOString() : null;
}