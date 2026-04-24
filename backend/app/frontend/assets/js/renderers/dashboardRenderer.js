import { formatBirthday, formatDateTime } from "../ui.js";

export function createDashboardRenderer({ state, actions, common }) {
    const { createListItem, renderSimpleList } = common;

    function getEventStartTimestamp(event) {
        return new Date(event.start_time || event.date || 0).getTime();
    }

    function getNextBirthdayTimestamp(person) {
        const value = String(person.birth_date || "");
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
            return Number.POSITIVE_INFINITY;
        }

        const month = Number(match[2]);
        const day = Number(match[3]);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const toBirthdayDate = (year) => {
            const maxDayInMonth = new Date(year, month, 0).getDate();
            return new Date(year, month - 1, Math.min(day, maxDayInMonth), 12, 0, 0, 0);
        };

        let nextBirthday = toBirthdayDate(now.getFullYear());
        if (nextBirthday < today) {
            nextBirthday = toBirthdayDate(now.getFullYear() + 1);
        }
        return nextBirthday.getTime();
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

    function renderDashboard() {
        const livingPeople = state.data.people.filter((person) => !person.date_of_death);
        const nowMs = Date.now();

        const upcomingEvents = [...state.data.events]
            .filter((event) => getEventStartTimestamp(event) >= nowMs)
            .sort((a, b) => getEventStartTimestamp(a) - getEventStartTimestamp(b))
            .slice(0, 5);

        const recentEvents = [...state.data.events]
            .filter((event) => getEventStartTimestamp(event) < nowMs)
            .sort((a, b) => getEventStartTimestamp(b) - getEventStartTimestamp(a))
            .slice(0, 5);

        const birthdays = livingPeople
            .filter((person) => person.birth_date)
            .sort((a, b) => {
                const timeDelta = getNextBirthdayTimestamp(a) - getNextBirthdayTimestamp(b);
                if (timeDelta !== 0) {
                    return timeDelta;
                }
                return String(a.first_name || "").localeCompare(String(b.first_name || ""), undefined, { sensitivity: "base" });
            })
            .slice(0, 8);

        renderSimpleList(
            document.getElementById("dashboard-events"),
            upcomingEvents,
            (item) => {
                const row = createListItem(item.title || item.location || "Untitled event", formatDateTime(item.date));
                bindEntityNavigation(row, "events", item.id, async () => {
                    state.activeSection = "events";
                    await actions.selectEvent(item.id);
                });
                return row;
            },
            "No upcoming events yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-recent-events"),
            recentEvents,
            (item) => {
                const row = createListItem(item.title || item.location || "Event", formatDateTime(item.date));
                bindEntityNavigation(row, "events", item.id, async () => {
                    state.activeSection = "events";
                    await actions.selectEvent(item.id);
                });
                return row;
            },
            "No recent events recorded yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-birthdays"),
            birthdays,
            (item) => {
                const row = createListItem(`${item.first_name} ${item.last_name || ""}`.trim(), formatBirthday(item.birth_date));
                bindEntityNavigation(row, "people", item.id, async () => {
                    await actions.openPersonFromContext(item.id);
                });
                return row;
            },
            "No birthdays available."
        );
    }

    return { renderDashboard };
}
