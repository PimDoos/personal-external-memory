import { clearNodeChildren, createButtonNode, createNode } from "../dom.js";

export function createCalendarRenderer({ state, actions }) {
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    function getDateFromISOString(isoString) {
        if (!isoString) return null;
        // Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss" without timezone conversion
        const m = String(isoString).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        return new Date(year, month - 1, day);
    }

    function getEventDayKeys(event) {
        // Returns all day keys that the event spans across
        const keys = [];

        // Try to get start and end dates
        let startDate = null;
        let endDate = null;

        if (event.start_time && event.end_time) {
            // Multi-day event with explicit start and end times
            startDate = getDateFromISOString(event.start_time);
            endDate = getDateFromISOString(event.end_time);
        } else if (event.start_time) {
            // Single event with start_time, no end_time
            startDate = getDateFromISOString(event.start_time);
            endDate = startDate;
        } else if (event.date) {
            // Event with date field only
            startDate = getDateFromISOString(event.date);
            endDate = startDate;
        }

        if (!startDate) {
            return keys;
        }

        // Generate day key for each day from start to end (inclusive)
        const current = new Date(startDate);
        while (current <= endDate) {
            const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
            keys.push(key);
            current.setDate(current.getDate() + 1);
        }

        return keys;
    }

    function buildEventsByDayMap() {
        const map = new Map();
        state.data.events.forEach((event) => {
            const keys = getEventDayKeys(event);
            keys.forEach((key) => {
                if (!map.has(key)) {
                    map.set(key, []);
                }
                map.get(key).push(event);
            });
        });
        // Sort events within each day by start time
        map.forEach((events) => {
            events.sort((a, b) => {
                const ta = new Date(a.start_time || a.date || 0).getTime();
                const tb = new Date(b.start_time || b.date || 0).getTime();
                return ta - tb;
            });
        });
        return map;
    }

    function buildDayKey(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    function formatEventTime(event) {
        const timeStr = event.start_time || event.date;
        if (!timeStr) {
            return "";
        }
        const d = new Date(timeStr);
        if (Number.isNaN(d.getTime())) {
            return "";
        }
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    function renderCalendar() {
        const panel = document.getElementById("calendar-panel");
        if (!panel) {
            return;
        }

        clearNodeChildren(panel);

        const { year, month } = state.calendarView;
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);
        const today = new Date();
        const todayKey = buildDayKey(today.getFullYear(), today.getMonth(), today.getDate());

        // --- Header: prev / month-label / next ---
        const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
            .format(firstOfMonth);

        const prevBtn = createButtonNode("‹", "ghost-button", () => {
            const d = new Date(year, month - 1, 1);
            state.calendarView.year = d.getFullYear();
            state.calendarView.month = d.getMonth();
            renderCalendar();
        });
        prevBtn.setAttribute("aria-label", "Previous month");
        prevBtn.classList.add("calendar-nav-btn");

        const nextBtn = createButtonNode("›", "ghost-button", () => {
            const d = new Date(year, month + 1, 1);
            state.calendarView.year = d.getFullYear();
            state.calendarView.month = d.getMonth();
            renderCalendar();
        });
        nextBtn.setAttribute("aria-label", "Next month");
        nextBtn.classList.add("calendar-nav-btn");

        const todayBtn = createButtonNode("Today", "secondary-button", () => {
            const now = new Date();
            state.calendarView.year = now.getFullYear();
            state.calendarView.month = now.getMonth();
            renderCalendar();
        });
        todayBtn.classList.add("calendar-today-btn");

        const header = createNode("div", {
            className: "calendar-header",
            children: [
                prevBtn,
                createNode("h2", { className: "calendar-month-label", text: monthLabel }),
                nextBtn,
                todayBtn,
            ],
        });
        panel.appendChild(header);

        // --- Day-of-week header row ---
        const dayHeaderRow = createNode("div", { className: "calendar-grid" });
        DAY_NAMES.forEach((name) => {
            dayHeaderRow.appendChild(createNode("div", { className: "calendar-day-header", text: name }));
        });
        panel.appendChild(dayHeaderRow);

        // --- Day cells ---
        // getDay(): 0=Sun … 6=Sat. We want Mon=0, so shift by (day+6)%7
        const startOffset = (firstOfMonth.getDay() + 6) % 7;
        const daysInMonth = lastOfMonth.getDate();
        const totalCells = startOffset + daysInMonth;
        const trailingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

        const eventsByDay = buildEventsByDayMap();

        const bodyGrid = createNode("div", { className: "calendar-grid calendar-grid--body" });

        // Leading empty cells
        for (let i = 0; i < startOffset; i++) {
            bodyGrid.appendChild(createNode("div", { className: "calendar-cell calendar-cell--empty" }));
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = buildDayKey(year, month, day);
            const isToday = dayKey === todayKey;
            const dayEvents = eventsByDay.get(dayKey) || [];

            const cell = createNode("div", {
                className: `calendar-cell${isToday ? " calendar-cell--today" : ""}`,
            });

            const dayMeta = createNode("div", { className: "calendar-day-meta" });
            dayMeta.appendChild(createNode("span", {
                className: "calendar-day-num",
                text: String(day),
            }));

            const addButton = createButtonNode("+ Add", "ghost-button", async (e) => {
                e.stopPropagation();
                await actions.openEventCreateForDate(dayKey);
            }, { type: "button" });
            addButton.classList.add("calendar-day-add");
            addButton.setAttribute("aria-label", `Add event on ${dayKey}`);
            dayMeta.appendChild(addButton);

            cell.appendChild(dayMeta);

            dayEvents.forEach((event) => {
                const title = event.title || `Event #${event.id}`;
                const time = formatEventTime(event);
                const label = time ? `${time} ${title}` : title;
                const pill = createNode("div", {
                    className: "calendar-event-pill",
                    text: label,
                    attrs: { title: label, role: "button", tabindex: "0" },
                });
                pill.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    await actions.openEventFromContext(event.id);
                });
                pill.addEventListener("keydown", async (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        await actions.openEventFromContext(event.id);
                    }
                });
                cell.appendChild(pill);
            });

            bodyGrid.appendChild(cell);
        }

        // Trailing empty cells
        for (let i = 0; i < trailingCells; i++) {
            bodyGrid.appendChild(createNode("div", { className: "calendar-cell calendar-cell--empty" }));
        }

        panel.appendChild(bodyGrid);
    }

    return { renderCalendar };
}
