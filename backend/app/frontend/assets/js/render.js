import { createRenderCommon } from "./renderers/common.js";
import { createDashboardRenderer } from "./renderers/dashboardRenderer.js";
import { createPeopleRenderer } from "./renderers/peopleRenderer.js";
import { createCirclesRenderer } from "./renderers/circlesRenderer.js";
import { createBrandsRenderer } from "./renderers/brandsRenderer.js";
import { createEventsRenderer } from "./renderers/eventsRenderer.js";
import { createInteractionsRenderer } from "./renderers/interactionsRenderer.js";
import { createTagsRenderer } from "./renderers/tagsRenderer.js";

export function createRenderer(ctx) {
    const {
        state,
        refs,
        caches,
        actions,
    } = ctx;

    const common = createRenderCommon({ state, refs });

    const { renderDashboard } = createDashboardRenderer({ state, common });
    const { renderPeople } = createPeopleRenderer({ state, caches, actions, common });
    const { renderCircles } = createCirclesRenderer({ state, caches, actions, common });
    const { renderBrands } = createBrandsRenderer({ state, actions, common });
    const { renderEvents } = createEventsRenderer({ state, caches, actions, common });
    const { renderInteractions } = createInteractionsRenderer({ state, caches, actions, common });
    const { renderTags } = createTagsRenderer({ state, actions, common });

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
        renderInteractions();
        renderTags();
    }

    return {
        renderAll,
        setAuthShell: common.setAuthShell,
    };
}
