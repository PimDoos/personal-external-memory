import { clearNodeChildren, createEmptyStateNode, createNode } from "../dom.js";
import { formatDateTime } from "../ui.js";
import { getAvatarInitials } from "../avatar.js";

export function createRenderCommon({ state, refs, caches }) {
    function filtered(section, items, ...extractors) {
        const needle = (state.filters[section] || "").trim().toLowerCase();
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

    function setAuthShell() {
        const isAuthenticated = Boolean(state.token);
        refs.authPanel.classList.toggle("hidden", isAuthenticated);
        refs.navigationPanel.classList.toggle("hidden", !isAuthenticated);
        refs.contentPanel.classList.toggle("hidden", !isAuthenticated);
        refs.logoutButton.classList.toggle("hidden", !isAuthenticated);
        refs.userEmail.innerText = state.email || "-";

        const countBySection = {
            people: state.data.people.length,
            circles: state.data.circles.length,
            brands: state.data.brands.length,
            events: state.data.events.length,
            tags: state.data.tags.length,
            locations: state.data.locations.length,
            types: Object.values(state.data.typeLists || {}).reduce((total, items) => total + items.length, 0),
        };

        document.querySelectorAll(".nav-button").forEach((node) => {
            node.classList.toggle("active", node.dataset.section === state.activeSection);
            const section = node.dataset.section;
            if (countBySection[section] !== undefined) {
                node.innerText = `${node.dataset.label || node.innerText.split(" (")[0]} (${countBySection[section]})`;
            }
        });

        document.querySelectorAll(".view-section").forEach((node) => {
            node.classList.toggle("active", node.id === `section-${state.activeSection}`);
        });

        document.querySelectorAll("[data-filter-section]").forEach((inputNode) => {
            const section = inputNode.dataset.filterSection;
            if (!section) {
                return;
            }
            if (inputNode.value !== (state.filters[section] || "")) {
                inputNode.value = state.filters[section] || "";
            }
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

    function createListItem(title, subtitle, actionsNode, leadingNode) {
        const textBlock = createNode("div", {
            className: "list-item__text",
            children: [
                createNode("h4", { text: title }),
                createNode("p", { className: "muted", text: subtitle || "" }),
            ],
        });

        const mainChildren = [];
        if (leadingNode) {
            mainChildren.push(leadingNode);
        }
        mainChildren.push(textBlock);

        const rowChildren = [
            createNode("div", {
                className: "list-item__main",
                children: mainChildren,
            }),
        ];

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

    function createEventCard(event) {
        const eventParticipants = (caches.topology.eventParticipantsByEventId.get(event.id)
            || caches.eventParticipants.get(event.id)
            || []);

        let participantNode = null;
        if (eventParticipants.length) {
            const wrapper = createNode("div", { className: "dashboard-participants" });
            const visibleParticipants = eventParticipants.slice(0, 5);

            visibleParticipants.forEach((participant) => {
                const person = state.data.people.find((entry) => entry.id === participant.person_id);
                const label = person
                    ? `${person.first_name} ${person.last_name || ""}`.trim()
                    : `Person #${participant.person_id}`;
                const avatar = createNode("span", {
                    className: "dashboard-avatar",
                    text: getAvatarInitials(label),
                    attrs: { title: label, "aria-label": label },
                });
                wrapper.appendChild(avatar);
            });

            if (eventParticipants.length > visibleParticipants.length) {
                wrapper.appendChild(createNode("span", {
                    className: "dashboard-avatar dashboard-avatar--more",
                    text: `+${eventParticipants.length - visibleParticipants.length}`,
                    attrs: { title: `${eventParticipants.length} participants` },
                }));
            }

            participantNode = wrapper;
        }

        return createListItem(
            event.title || `Event #${event.id}`,
            formatDateTime(event.date),
            participantNode
        );
    }

    return {
        caches,
        filtered,
        nameOfPerson,
        selectedPerson,
        selectedCircle,
        selectedEvent,
        setAuthShell,
        renderSimpleList,
        createMetricCard,
        createListItem,
        createEventCard,
    };
}
