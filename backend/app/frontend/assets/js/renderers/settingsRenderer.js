import { createCombobox } from "../combobox.js";

export function createSettingsRenderer({ state }) {
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
    }

    return {
        renderSettings,
    };
}
