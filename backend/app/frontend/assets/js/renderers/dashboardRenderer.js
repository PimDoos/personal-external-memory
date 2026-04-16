import { clearNodeChildren } from "../dom.js";
import { formatBirthday, formatDateTime } from "../ui.js";

export function createDashboardRenderer({ state, common }) {
    const { createMetricCard, createListItem, renderSimpleList } = common;

    function renderDashboard() {
        const metricGrid = document.getElementById("metric-grid");
        clearNodeChildren(metricGrid);
        metricGrid.appendChild(createMetricCard("People", state.data.people.length));
        metricGrid.appendChild(createMetricCard("Circles", state.data.circles.length));
        metricGrid.appendChild(createMetricCard("Events", state.data.events.length));
        metricGrid.appendChild(createMetricCard("Interactions", state.data.interactions.length));

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
            (item) => createListItem(item.location || "Untitled event", formatDateTime(item.date)),
            "No upcoming events yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-interactions"),
            recentInteractions,
            (item) => createListItem(item.medium || "Interaction", formatDateTime(item.date)),
            "No interactions recorded yet."
        );

        renderSimpleList(
            document.getElementById("dashboard-birthdays"),
            birthdays,
            (item) => createListItem(`${item.first_name} ${item.last_name || ""}`.trim(), formatBirthday(item.birth_date)),
            "No birthdays available."
        );
    }

    return { renderDashboard };
}
