export function getNodeById(id) {
    return document.getElementById(id);
}

export function clearNodeChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

export function createNode(tagName, options = {}) {
    const {
        className,
        text,
        attrs,
        dataset,
        children,
        type,
        value,
    } = options;

    const node = document.createElement(tagName);

    if (className) {
        node.className = className;
    }

    if (text !== undefined && text !== null) {
        node.innerText = String(text);
    }

    if (type) {
        node.type = type;
    }

    if (value !== undefined) {
        node.value = value;
    }

    if (attrs) {
        Object.entries(attrs).forEach(([key, attrValue]) => {
            if (attrValue === false || attrValue === null || attrValue === undefined) {
                return;
            }
            if (attrValue === true) {
                node.setAttribute(key, "");
            } else {
                node.setAttribute(key, String(attrValue));
            }
        });
    }

    if (dataset) {
        Object.entries(dataset).forEach(([key, dataValue]) => {
            node.dataset[key] = String(dataValue);
        });
    }

    if (children) {
        children.forEach((child) => {
            if (!child) {
                return;
            }
            node.appendChild(child);
        });
    }

    return node;
}

export function createButtonNode(text, className, onClick, options = {}) {
    const node = createNode("button", {
        className,
        text,
        type: options.type || "button",
        attrs: options.attrs,
    });

    if (onClick) {
        node.addEventListener("click", (event) => {
            event.stopPropagation();
            onClick(event);
        });
    }

    if (options.disabled) {
        node.disabled = true;
    }

    return node;
}

export function createSelectNode(options, selectedValue, attrs = {}) {
    const node = createNode("select", { attrs });

    options.forEach((option) => {
        const optionNode = createNode("option", {
            text: option.label,
            attrs: { value: option.value },
        });

        if (String(option.value) === String(selectedValue)) {
            optionNode.selected = true;
        }

        node.appendChild(optionNode);
    });

    return node;
}

export function createLabeledFieldNode(labelText, controlNode) {
    const label = createNode("label");
    label.appendChild(createNode("span", { text: labelText }));
    label.appendChild(controlNode);
    return label;
}

export function createEmptyStateNode(message) {
    return createNode("div", {
        className: "empty-state",
        text: message,
    });
}

export function createFormDataObject(formElement) {
    return Object.fromEntries(new FormData(formElement).entries());
}
