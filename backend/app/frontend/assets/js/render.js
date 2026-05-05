import { createRenderCommon } from "./renderers/common.js";
import { createDashboardRenderer } from "./renderers/dashboardRenderer.js";
import { createPeopleRenderer } from "./renderers/peopleRenderer.js";
import { createCirclesRenderer } from "./renderers/circlesRenderer.js";
import { createBrandsRenderer } from "./renderers/brandsRenderer.js";
import { createEventsRenderer } from "./renderers/eventsRenderer.js";
import { createTagsRenderer } from "./renderers/tagsRenderer.js";
import { createLocationsRenderer } from "./renderers/locationsRenderer.js";
import { createTypesRenderer } from "./renderers/typesRenderer.js";
import { createTopologyRenderer } from "./renderers/topologyRenderer.js";
import { createCalendarRenderer } from "./renderers/calendarRenderer.js";

export function createRenderer(ctx) {
    const {
        state,
        refs,
        caches,
        actions,
    } = ctx;

    const common = createRenderCommon({ state, refs, caches });

    const { renderDashboard } = createDashboardRenderer({ state, caches, actions, common });
    const { renderPeople } = createPeopleRenderer({ state, caches, actions, common });
    const { renderCircles } = createCirclesRenderer({ state, caches, actions, common });
    const { renderBrands } = createBrandsRenderer({ state, caches, actions, common });
    const { renderEvents } = createEventsRenderer({ state, caches, actions, common });
    const { renderTags } = createTagsRenderer({ state, caches, actions, common });
    const { renderLocations } = createLocationsRenderer({ state, caches, actions, common });
    const { renderTypes } = createTypesRenderer({ state, actions });
    const { renderTopology } = createTopologyRenderer({ state, caches, actions });
    const { renderCalendar } = createCalendarRenderer({ state, actions });

    function renderAll() {
        common.setAuthShell();
        if (!state.token) {
            return;
        }

        renderDashboard();
        renderPeople();
        renderCircles();
        renderBrands();
        renderEvents();
        renderTags();
        renderLocations();
        renderTypes();
        renderTopology();
        renderCalendar();
    }

    return {
        renderAll,
        setAuthShell: common.setAuthShell,
    };
}
