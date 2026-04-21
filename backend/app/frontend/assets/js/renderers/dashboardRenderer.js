import { formatBirthday, formatDateTime } from "../ui.js";

export function createDashboardRenderer({ state, actions, common }) {
    const { createListItem, renderSimpleList } = common;

    function renderDashboard() {
        const upcomingEvents = [...state.data.events]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);

        const recentInteractions = [...state.data.interactions]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);

        const birthdays = state.data.people
            .filter((person) => person.birth_date)
            .sort((a, b) => new Date(a.birth_date) - new Date(b.birth_date))
            .slice(0, 8);

        renderSimpleList(
            document.getElementById("dashboard-events"),
            upcomingEvents,
            (item) => {
                const row = createListItem(item.title || item.location || "Untitled event", formatDateTime(item.date));
                row.addEventListener("click", async () => {
                    state.activeSection = "events";
                    await actions.selectEvent(item.id);
                });
                return row;
            },
            "No upcoming events yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-interactions"),
            recentInteractions,
            (item) => {
                const row = createListItem(item.title || item.medium || "Interaction", formatDateTime(item.date));
                row.addEventListener("click", async () => {
                    state.activeSection = "interactions";
                    await actions.selectInteraction(item.id);
                });
                return row;
            },
            "No interactions recorded yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-birthdays"),
            birthdays,
            (item) => {
                const row = createListItem(`${item.first_name} ${item.last_name || ""}`.trim(), formatBirthday(item.birth_date));
                row.addEventListener("click", async () => {
                    await actions.openPersonFromContext(item.id);
                });
                return row;
            },
            "No birthdays available."
        );
    }

    return { renderDashboard };
}
