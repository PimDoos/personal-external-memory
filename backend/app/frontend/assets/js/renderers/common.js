import { clearNodeChildren, createEmptyStateNode, createNode } from "../dom.js";

export function createRenderCommon({ state, refs }) {
    function filtered(items, ...extractors) {
        const needle = state.filter.trim().toLowerCase();
        if (!needle) {
            return items;
        }

        return items.filter((item) => {
            return extractors.some((extract) => {
                const value = extract(item);
                return String(value || "").toLowerCase().includes(needle);
            });
        });
    }

    function nameOfPerson(personId) {
        const person = state.data.people.find((entry) => entry.id === personId);
        if (!person) {
            return `Person #${personId}`;
        }
        return `${person.first_name} ${person.last_name || ""}`.trim();
    }

    function selectedPerson() {
        return state.data.people.find((entry) => entry.id === state.selected.personId) || null;
    }

    function selectedCircle() {
        return state.data.circles.find((entry) => entry.id === state.selected.circleId) || null;
    }

    function selectedEvent() {
        return state.data.events.find((entry) => entry.id === state.selected.eventId) || null;
    }

    function selectedInteraction() {
        return state.data.interactions.find((entry) => entry.id === state.selected.interactionId) || null;
    }

    function setAuthShell() {
        const isAuthenticated = Boolean(state.token);
        refs.authPanel.classList.toggle("hidden", isAuthenticated);
        refs.navigationPanel.classList.toggle("hidden", !isAuthenticated);
        refs.contentPanel.classList.toggle("hidden", !isAuthenticated);
        refs.logoutButton.classList.toggle("hidden", !isAuthenticated);
        refs.userEmail.innerText = state.email || "-";

        document.querySelectorAll(".nav-button").forEach((node) => {
            node.classList.toggle("active", node.dataset.section === state.activeSection);
        });

        document.querySelectorAll(".view-section").forEach((node) => {
            node.classList.toggle("active", node.id === `section-${state.activeSection}`);
        });
    }

    function renderSimpleList(targetNode, items, renderItem, emptyMessage) {
        clearNodeChildren(targetNode);

        if (!items.length) {
            targetNode.appendChild(createEmptyStateNode(emptyMessage));
            return;
        }

        items.forEach((item) => {
            targetNode.appendChild(renderItem(item));
        });
    }

    function createMetricCard(label, value) {
        return createNode("article", {
            className: "metric-card",
            children: [
                createNode("span", { className: "muted", text: label }),
                createNode("strong", { text: value }),
            ],
        });
    }

    function createListItem(title, subtitle, actionsNode) {
        const textBlock = createNode("div", {
            children: [
                createNode("h4", { text: title }),
                createNode("p", { className: "muted", text: subtitle || "" }),
            ],
        });

        const rowChildren = [textBlock];
        if (actionsNode) {
            rowChildren.push(actionsNode);
        }

        return createNode("div", {
            className: "list-item",
            children: [
                createNode("div", {
                    className: "list-item__row",
                    children: rowChildren,
                }),
            ],
        });
    }

    return {
        filtered,
        nameOfPerson,
        selectedPerson,
        selectedCircle,
        selectedEvent,
        selectedInteraction,
        setAuthShell,
        renderSimpleList,
        createMetricCard,
        createListItem,
    };
}
