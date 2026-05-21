/**
 * createCombobox — a reusable searchable combobox that acts as a drop-in
 * replacement for <select> inside HTML forms.
 *
 * Options:
 *   options      {Array<{value, label}>}  selectable items
 *   initialValue {string|number}          pre-selected value (matches option.value)
 *   attrs        {Object}                 supported keys:
 *                  name        — name of the hidden <input> (required for FormData)
 *                  placeholder — shown in the text input when nothing is selected
 *                  disabled    — prevents interaction when truthy
 *
 * The returned element is a <div class="combobox"> that:
 *   • exposes a .value getter/setter identical to a <select>
 *   • contains a hidden <input name="…"> that participates in FormData / form.reset()
 *   • supports keyboard navigation (↑ ↓ Enter Escape)
 *   • ranks results: exact match → starts-with → contains
 */

function scoreMatch(label, query) {
    const l = label.toLowerCase();
    const q = query.toLowerCase();
    if (l === q) return 0;
    if (l.startsWith(q)) return 1;
    return 2;
}

export function createCombobox(options, initialValue = "", attrs = {}) {
    const { name, placeholder = "Search…", disabled = false } = attrs;

    const initialOption = options.find((o) => String(o.value) === String(initialValue));

    // --- wrapper ---
    const wrapper = document.createElement("div");
    wrapper.className = "combobox";
    wrapper.setAttribute("role", "combobox");
    wrapper.setAttribute("aria-expanded", "false");
    wrapper.setAttribute("aria-haspopup", "listbox");

    // --- visible text input ---
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "combobox__input";
    textInput.placeholder = placeholder;
    textInput.autocomplete = "off";
    textInput.disabled = disabled;
    if (initialOption) {
        textInput.value = initialOption.label;
    }

    // --- hidden value carrier (participates in FormData + form.reset()) ---
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    if (name) {
        hiddenInput.name = name;
    }
    hiddenInput.value = initialOption ? String(initialOption.value) : "";

    // --- dropdown list ---
    const dropdown = document.createElement("ul");
    dropdown.className = "combobox__dropdown";
    dropdown.setAttribute("role", "listbox");

    let focusedIndex = -1;
    let visibleOptions = [];

    // --- helpers ---
    function open() {
        wrapper.setAttribute("aria-expanded", "true");
        dropdown.classList.add("open");
    }

    function close() {
        wrapper.setAttribute("aria-expanded", "false");
        dropdown.classList.remove("open");
        focusedIndex = -1;
    }

    function setFocus(index) {
        focusedIndex = index;
        const items = dropdown.querySelectorAll(".combobox__option");
        items.forEach((item, i) => item.classList.toggle("focused", i === focusedIndex));
        if (focusedIndex >= 0 && items[focusedIndex]) {
            items[focusedIndex].scrollIntoView({ block: "nearest" });
        }
    }

    function renderDropdown(filtered) {
        visibleOptions = filtered;
        focusedIndex = -1;
        dropdown.innerHTML = "";

        if (filtered.length === 0) {
            const empty = document.createElement("li");
            empty.className = "combobox__option combobox__option--empty";
            empty.textContent = "No matches";
            dropdown.appendChild(empty);
            return;
        }

        filtered.forEach((opt) => {
            const li = document.createElement("li");
            li.className = "combobox__option";
            li.setAttribute("role", "option");
            li.textContent = opt.label;
            if (String(opt.value) === hiddenInput.value) {
                li.setAttribute("aria-selected", "true");
            }
            // mousedown fires before blur — prevent focus loss
            li.addEventListener("mousedown", (e) => e.preventDefault());
            li.addEventListener("click", () => selectOption(opt));
            dropdown.appendChild(li);
        });
    }

    function getFiltered(query) {
        if (!query) return [...options];
        const q = query.toLowerCase();
        return options
            .filter((o) => o.label.toLowerCase().includes(q))
            .sort((a, b) => scoreMatch(a.label, query) - scoreMatch(b.label, query));
    }

    function selectOption(opt) {
        textInput.value = opt.label;
        hiddenInput.value = String(opt.value);
        close();
        // Notify the form of a change so any dependent listeners can react
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // --- event listeners ---
    textInput.addEventListener("focus", () => {
        if (disabled) return;
        renderDropdown(getFiltered(textInput.value));
        open();
    });

    textInput.addEventListener("input", () => {
        hiddenInput.value = "";
        renderDropdown(getFiltered(textInput.value));
        open();
    });

    textInput.addEventListener("blur", () => {
        // Give click handler time to fire before closing
        setTimeout(() => {
            close();
            // Reconcile text with selected value
            const selectedOpt = options.find((o) => String(o.value) === hiddenInput.value);
            if (!selectedOpt) {
                // Try exact label match
                const exact = options.find(
                    (o) => o.label.toLowerCase() === textInput.value.toLowerCase()
                );
                if (exact) {
                    selectOption(exact);
                } else {
                    hiddenInput.value = "";
                    textInput.value = "";
                }
            }
        }, 150);
    });

    textInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!dropdown.classList.contains("open")) {
                renderDropdown(getFiltered(textInput.value));
                open();
            }
            setFocus(Math.min(focusedIndex + 1, visibleOptions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocus(Math.max(focusedIndex - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (focusedIndex >= 0 && visibleOptions[focusedIndex]) {
                selectOption(visibleOptions[focusedIndex]);
            }
        } else if (e.key === "Escape") {
            close();
            textInput.blur();
        }
    });

    // --- public API ---
    Object.defineProperty(wrapper, "value", {
        get: () => hiddenInput.value,
        set: (v) => {
            const opt = options.find((o) => String(o.value) === String(v));
            hiddenInput.value = opt ? String(opt.value) : "";
            textInput.value = opt ? opt.label : "";
        },
    });

    wrapper.appendChild(textInput);
    wrapper.appendChild(dropdown);
    wrapper.appendChild(hiddenInput);

    return wrapper;
}
