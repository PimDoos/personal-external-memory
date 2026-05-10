import { createCombobox } from "../combobox.js";
import { clearNodeChildren, createNode } from "../dom.js";

export function createSettingsRenderer({ state, actions }) {
    function sortPeople(people) {
        return [...people].sort((left, right) => {
            const leftName = `${left.first_name || ""} ${left.last_name || ""}`.trim().toLowerCase();
            const rightName = `${right.first_name || ""} ${right.last_name || ""}`.trim().toLowerCase();
            return leftName.localeCompare(rightName);
        });
    }

    function renderSettings() {
        const formNode = document.getElementById("settings-form");
        if (!formNode) {
            return;
        }

        const mePersonField = document.getElementById("settings-me-person-field");
        const immichInput = formNode.querySelector("input[name='immich_api_key']");
        const immichBaseUrlInput = formNode.querySelector("input[name='immich_base_url']");
        const homeAssistantInput = formNode.querySelector("input[name='home_assistant_api_key']");
        const homeAssistantBaseUrlInput = formNode.querySelector("input[name='home_assistant_base_url']");
        if (!mePersonField || !immichInput || !immichBaseUrlInput || !homeAssistantInput || !homeAssistantBaseUrlInput) {
            return;
        }

        const selectedPersonId = state.data.userSettings?.me_person_id;
        const people = sortPeople(state.data.people || []);
        const personOptions = [{ value: "", label: "Not set" }].concat(
            people.map((person) => ({
                value: String(person.id),
                label: `${person.first_name} ${person.last_name || ""}`.trim(),
            }))
        );

        mePersonField.innerHTML = "";
        mePersonField.appendChild(createCombobox(personOptions, selectedPersonId || "", {
            name: "me_person_id",
            placeholder: "Search people...",
        }));

        immichInput.value = state.data.userSettings?.immich_api_key || "";
        immichBaseUrlInput.value = state.data.userSettings?.immich_base_url || "";
        homeAssistantInput.value = state.data.userSettings?.home_assistant_api_key || "";
        homeAssistantBaseUrlInput.value = state.data.userSettings?.home_assistant_base_url || "";

        let integrationNode = document.getElementById("settings-immich-tools");
        if (!integrationNode) {
            integrationNode = createNode("div", {
                attrs: { id: "settings-immich-tools" },
                className: "settings-integration-tools",
            });
            formNode.appendChild(integrationNode);
        }

        clearNodeChildren(integrationNode);
        const testButton = createNode("button", {
            className: "secondary-button",
            text: "Test Immich Connection",
            attrs: { type: "button" },
        });
        testButton.addEventListener("click", async () => {
            await actions.testImmichConnection();
        });

        const syncButton = createNode("button", {
            className: "secondary-button",
            text: "Sync Immich Faces",
            attrs: { type: "button" },
        });
        syncButton.addEventListener("click", async () => {
            await actions.syncImmichFaces();
        });

        integrationNode.appendChild(
            createNode("div", {
                className: "list-actions",
                children: [testButton, syncButton],
            })
        );

        if (state.data.immich?.connectionMessage) {
            integrationNode.appendChild(
                createNode("p", {
                    className: "muted",
                    text: `Connection: ${state.data.immich.connectionMessage}`,
                })
            );
        }
        if (state.data.immich?.syncMessage) {
            integrationNode.appendChild(
                createNode("p", {
                    className: "muted",
                    text: `Sync: ${state.data.immich.syncMessage}`,
                })
            );
        }
    }

    return {
        renderSettings,
    };
}
