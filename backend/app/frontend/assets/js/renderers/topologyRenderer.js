import { createNode } from "../dom.js";

const EDGE_COLORS = {
    relationship: "#c5483f",
    affiliation: "#3674cf",
    membership: "#2f9a6a",
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function createTopologyRenderer({ state, caches, actions }) {
    const positions = new Map();
    const velocities = new Map();
    const viewport = { scale: 1, tx: 0, ty: 0 };
    let animationFrameId = null;
    let handlersBound = false;
    let graphHandlersBound = false;
    let lastLayoutSignature = "";
    let renderFrameRef = null;
    let viewportGroupRef = null;
    let draggedNodeId = null;
    let hoveredNodeId = null;
    let activeGraphRef = null;
    let simulationBounds = { width: 1200, height: 700 };
    let simulationTickCount = 0;

    function relationEmoji(relationshipType) {
        const entry = (state.data.typeLists.relationshipTypes || []).find(
            (item) => String(item.name || "").toLowerCase() === String(relationshipType || "").toLowerCase()
        );
        return entry?.emoji || "";
    }

    function keyPair(idA, idB) {
        return idA < idB ? `${idA}__${idB}` : `${idB}__${idA}`;
    }

    function hashString(value) {
        let hash = 0;
        const text = String(value || "");
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function getNodeRadius(node) {
        if (!node) {
            return 16;
        }
        if (node.entity === "brand") {
            return 19;
        }
        if (node.entity === "circle") {
            return 22;
        }
        return 16;
    }

    function getNodeLabelLines(node) {
        if (!node) {
            return [];
        }

        if (Array.isArray(node.labelLines) && node.labelLines.length) {
            return node.labelLines;
        }

        return [node.label || ""];
    }

    function getNodeHitMetrics(node) {
        const radius = getNodeRadius(node);
        const labelLines = getNodeLabelLines(node);
        const lineHeight = 13;
        const labelTopOffset = radius + 18;
        const labelWidth = Math.max(
            radius * 2,
            ...labelLines.map((line) => Math.max(0, String(line || "").length * 7))
        );
        const labelHeight = Math.max(0, labelLines.length * lineHeight);
        const left = -Math.max(radius, labelWidth / 2) - 8;
        const right = Math.max(radius, labelWidth / 2) + 8;
        const top = -radius - 8;
        const bottom = Math.max(radius, labelTopOffset + labelHeight) + 8;

        return {
            radius,
            labelLines,
            lineHeight,
            labelTopOffset,
            labelWidth,
            labelHeight,
            left,
            right,
            top,
            bottom,
            collisionRadius: Math.sqrt(
                Math.max(radius, labelWidth / 2) ** 2 + Math.max(radius, labelTopOffset + labelHeight * 0.5) ** 2
            ),
        };
    }

    function getSvgPoint(event, svg) {
        const screenMatrix = svg.getScreenCTM();
        if (!screenMatrix) {
            return { x: 0, y: 0 };
        }

        const point = new DOMPoint(event.clientX, event.clientY);
        const svgPoint = point.matrixTransform(screenMatrix.inverse());
        return { x: svgPoint.x, y: svgPoint.y };
    }

    function getPointerWorldPosition(event, svg) {
        const matrix = viewportGroupRef?.getScreenCTM();
        if (!matrix) {
            const point = getSvgPoint(event, svg);
            return {
                x: (point.x - viewport.tx) / viewport.scale,
                y: (point.y - viewport.ty) / viewport.scale,
            };
        }

        const point = new DOMPoint(event.clientX, event.clientY);
        const worldPoint = point.matrixTransform(matrix.inverse());
        return { x: worldPoint.x, y: worldPoint.y };
    }

    function getPanDelta(currentPoint, lastPoint) {
        return {
            x: currentPoint.x - lastPoint.x,
            y: currentPoint.y - lastPoint.y,
        };
    }

    function findNodeGroup(target) {
        if (!target || typeof target.closest !== "function") {
            return null;
        }
        return target.closest(".topology-node");
    }

    function getGraphDimensions(nodeCount) {
        const safeCount = Math.max(1, nodeCount);
        const densityScale = Math.sqrt(safeCount);
        const width = Math.max(1200, Math.round(760 + (densityScale * 190)));
        const height = Math.max(700, Math.round(520 + (densityScale * 160)));
        return { width, height };
    }

    function getSimulationPadding(nodeCount) {
        return 32 + Math.min(64, Math.sqrt(Math.max(1, nodeCount)) * 6);
    }

    function scheduleSimulation(graph) {
        if (graph) {
            activeGraphRef = graph;
        }

        if (!activeGraphRef) {
            return;
        }

        if (animationFrameId !== null) {
            return;
        }

        simulationTickCount = 0;
        const animate = () => {
            if (!activeGraphRef) {
                animationFrameId = null;
                return;
            }

            simulationTickCount += 1;
            const kineticEnergy = stepSimulation(
                activeGraphRef.nodes,
                activeGraphRef.edges,
                simulationBounds.width,
                simulationBounds.height
            );
            if (renderFrameRef) {
                renderFrameRef();
            }

            const hasSignificantMotion = kineticEnergy > 0.2;
            const shouldContinue = draggedNodeId || hasSignificantMotion || simulationTickCount < 50;
            if (shouldContinue && simulationTickCount < 1000) {
                animationFrameId = window.requestAnimationFrame(animate);
                return;
            }

            animationFrameId = null;
        };

        animationFrameId = window.requestAnimationFrame(animate);
    }

    function distancePointToSegment(point, start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSq = (dx * dx) + (dy * dy);
        if (!lengthSq) {
            const distX = point.x - start.x;
            const distY = point.y - start.y;
            return Math.sqrt((distX * distX) + (distY * distY));
        }

        const projection = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSq));
        const closestX = start.x + (projection * dx);
        const closestY = start.y + (projection * dy);
        const offsetX = point.x - closestX;
        const offsetY = point.y - closestY;
        return Math.sqrt((offsetX * offsetX) + (offsetY * offsetY));
    }

    function computeEdgeGeometry(edge, positionsById, nodesById, allNodes) {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        const source = positionsById.get(edge.source);
        const target = positionsById.get(edge.target);

        if (!sourceNode || !targetNode || !source || !target) {
            return null;
        }

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.sqrt((dx * dx) + (dy * dy)), 1);
        const unitX = dx / distance;
        const unitY = dy / distance;
        const normalX = -unitY;
        const normalY = unitX;
        const sourceRadius = getNodeRadius(sourceNode);
        const targetRadius = getNodeRadius(targetNode);

        const start = {
            x: source.x + (unitX * sourceRadius),
            y: source.y + (unitY * sourceRadius),
        };
        const end = {
            x: target.x - (unitX * targetRadius),
            y: target.y - (unitY * targetRadius),
        };

        const midpoint = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
        };

        let curvature = 0;
        if (edge.type === "membership") {
            curvature = 18;
        } else if (edge.type === "affiliation") {
            curvature = 10;
        }

        const obstruction = allNodes.find((node) => {
            if (node.id === edge.source || node.id === edge.target) {
                return false;
            }
            const pos = positionsById.get(node.id);
            if (!pos) {
                return false;
            }
            return distancePointToSegment(pos, start, end) < (getNodeRadius(node) + 8);
        });

        if (obstruction) {
            const obstructionPos = positionsById.get(obstruction.id);
            const direction = ((midpoint.x - obstructionPos.x) * normalX) + ((midpoint.y - obstructionPos.y) * normalY) >= 0 ? 1 : -1;
            curvature += direction * (getNodeRadius(obstruction) + 18);
        }

        if (curvature === 0) {
            return {
                start,
                end,
                path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
                labelPoint: midpoint,
            };
        }

        const control = {
            x: midpoint.x + (normalX * curvature),
            y: midpoint.y + (normalY * curvature),
        };

        return {
            start,
            end,
            control,
            path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
            labelPoint: {
                x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
                y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
            },
        };
    }

    function decorateNodesWithConnectionCounts(nodes, edges) {
        const counts = new Map(nodes.map((node) => [node.id, 0]));
        edges.forEach((edge) => {
            counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
            counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
        });

        const values = [...counts.values()];
        const minConnections = values.length ? Math.min(...values) : 0;
        const maxConnections = values.length ? Math.max(...values) : 0;
        const spread = Math.max(1, maxConnections - minConnections);

        return nodes.map((node) => {
            const connectionCount = counts.get(node.id) || 0;
            const normalizedConnectionCount = (connectionCount - minConnections) / spread;
            return {
                ...node,
                connectionCount,
                normalizedConnectionCount,
            };
        });
    }

    function graphLayoutSignature(graph) {
        return graph.nodes
            .map((node) => `${node.id}:${node.connectionCount || 0}`)
            .sort()
            .join("|");
    }

    function buildGraph() {
        const showDeceased = state.topologyFilters.showDeceased !== false;
        const personFilter = (person) => showDeceased || !person.date_of_death;
        const livingPersonIds = new Set(
            state.data.people
                .filter(personFilter)
                .map((person) => person.id)
        );
        const nodes = [
            ...state.data.people.filter(personFilter).map((person) => ({
                id: `person:${person.id}`,
                entity: "person",
                entityId: person.id,
                label: `${person.first_name} ${person.last_name || ""}`.trim() || `Person #${person.id}`,
                labelLines: [person.first_name || "", person.last_name || ""].filter(Boolean),
            })),
            ...state.data.brands.map((brand) => ({
                id: `brand:${brand.id}`,
                entity: "brand",
                entityId: brand.id,
                label: brand.name || `Brand #${brand.id}`,
                labelLines: [brand.name || `Brand #${brand.id}`],
            })),
            ...state.data.circles.map((circle) => ({
                id: `circle:${circle.id}`,
                entity: "circle",
                entityId: circle.id,
                label: circle.name || `Circle #${circle.id}`,
                labelLines: [circle.name || `Circle #${circle.id}`],
            })),
        ];

        const edges = [];

        const sharedEventCounts = new Map();
        state.data.events.forEach((event) => {
            const participants = (caches.topology.eventParticipantsByEventId.get(event.id) || [])
                .map((entry) => entry.person_id)
                .filter((personId) => livingPersonIds.has(personId));
            for (let i = 0; i < participants.length; i += 1) {
                for (let j = i + 1; j < participants.length; j += 1) {
                    const source = `person:${participants[i]}`;
                    const target = `person:${participants[j]}`;
                    const pairKey = keyPair(source, target);
                    sharedEventCounts.set(pairKey, (sharedEventCounts.get(pairKey) || 0) + 1);
                }
            }
        });

        (caches.topology.relationships || []).forEach((relationship) => {
            if (!livingPersonIds.has(relationship.person_id_1) || !livingPersonIds.has(relationship.person_id_2)) {
                return;
            }
            const source = `person:${relationship.person_id_1}`;
            const target = `person:${relationship.person_id_2}`;
            const pairKey = keyPair(source, target);
            const eventCount = sharedEventCounts.get(pairKey) || 0;

            edges.push({
                id: `relationship:${relationship.id}`,
                type: "relationship",
                source,
                target,
                label: relationship.relationship_type || "",
                emoji: relationEmoji(relationship.relationship_type),
                weight: 1 + eventCount,
            });
        });

        const membershipEdgeMap = new Map();
        state.data.circles.forEach((circle) => {
            const members = (caches.topology.circleMembersByCircleId.get(circle.id) || [])
                .filter((memberId) => livingPersonIds.has(memberId));
            members.forEach((memberId) => {
                const pairKey = `${memberId}:${circle.id}`;
                edges.push({
                    id: `membership:${pairKey}`,
                    type: "membership",
                    source: `person:${memberId}`,
                    target: `circle:${circle.id}`,
                    weight: 1,
                    label: "Social circle membership",
                });
            });
        });

        (caches.topology.personBrandAffiliations || new Map()).forEach((brandSet, personId) => {
            if (!livingPersonIds.has(personId)) {
                return;
            }
            [...brandSet].forEach((brandId) => {
                edges.push({
                    id: `affiliation:${personId}:${brandId}`,
                    type: "affiliation",
                    source: `person:${personId}`,
                    target: `brand:${brandId}`,
                    label: "Affiliation",
                });
            });
        });

        return {
            nodes: decorateNodesWithConnectionCounts(nodes, edges),
            edges,
        };
    }

    function applyFilters(graph) {
        const relationshipTypeFilter = state.topologyFilters.relationshipType || "";
        const socialCircleIdFilter = Number(state.topologyFilters.socialCircleId || 0);
        const brandIdFilter = Number(state.topologyFilters.brandId || 0);
        const edgeVisibility = state.topologyFilters.edgeVisibility || {};
        const hasEdgeVisibilityFilter = Object.values(edgeVisibility).some((isVisible) => isVisible === false);

        let filteredEdges = graph.edges.filter((edge) => edgeVisibility[edge.type] !== false);

        if (relationshipTypeFilter) {
            filteredEdges = filteredEdges.filter((edge) => {
                if (edge.type !== "relationship") {
                    return false;
                }
                return String(edge.label || "").toLowerCase() === relationshipTypeFilter.toLowerCase();
            });
        }

        let allowedNodeIds = null;
        if (socialCircleIdFilter) {
            const circleNodeId = `circle:${socialCircleIdFilter}`;
            const memberNodeIds = new Set(
                (caches.topology.circleMembersByCircleId.get(socialCircleIdFilter) || []).map((memberId) => `person:${memberId}`)
            );
            allowedNodeIds = new Set([circleNodeId, ...memberNodeIds]);
            filteredEdges = filteredEdges.filter((edge) => {
                return allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target);
            });
        }

        if (brandIdFilter) {
            filteredEdges = filteredEdges.filter((edge) => {
                if (edge.type !== "affiliation") {
                    return false;
                }
                return edge.target === `brand:${brandIdFilter}` || edge.source === `brand:${brandIdFilter}`;
            });
        }

        if (!relationshipTypeFilter && !socialCircleIdFilter && !brandIdFilter && !hasEdgeVisibilityFilter) {
            return graph;
        }

        const nodeIds = allowedNodeIds ? new Set(allowedNodeIds) : new Set();
        filteredEdges.forEach((edge) => {
            nodeIds.add(edge.source);
            nodeIds.add(edge.target);
        });

        const filteredNodes = graph.nodes.filter((node) => nodeIds.has(node.id));

        return {
            nodes: decorateNodesWithConnectionCounts(filteredNodes, filteredEdges),
            edges: filteredEdges,
        };
    }

    function ensurePosition(node, width, height) {
        if (!positions.has(node.id)) {
            const seed = hashString(node.id);
            const angle = ((seed % 360) / 360) * Math.PI * 2;
            const outwardBias = 1 - (node.normalizedConnectionCount || 0);
            const innerRadius = node.entity === "circle"
                ? Math.min(width, height) * 0.14
                : Math.min(width, height) * 0.1;
            const outerRadius = node.entity === "circle"
                ? Math.min(width, height) * 0.34
                : Math.min(width, height) * 0.42;
            const radius = innerRadius + ((outerRadius - innerRadius) * outwardBias);
            const jitterRadius = Math.max(8, radius * 0.08);
            const jitterAngle = ((((Math.floor(seed / 360)) % 360) / 360) * Math.PI * 2);
            positions.set(node.id, {
                x: (width * 0.5) + (Math.cos(angle) * radius) + (Math.cos(jitterAngle) * jitterRadius),
                y: (height * 0.5) + (Math.sin(angle) * radius) + (Math.sin(jitterAngle) * jitterRadius),
            });
            velocities.set(node.id, { x: 0, y: 0 });
        }
    }

    function stepSimulation(nodes, edges, width, height) {
        const repulsion = 3200;
        const spring = 0.015;
        const damping = 0.86;
        const centerPull = 0.004;
        const boundaryPadding = getSimulationPadding(nodes.length);

        nodes.forEach((node) => ensurePosition(node, width, height));

        for (let i = 0; i < nodes.length; i += 1) {
            const nodeA = nodes[i];
            const posA = positions.get(nodeA.id);
            const velA = velocities.get(nodeA.id);

            for (let j = i + 1; j < nodes.length; j += 1) {
                const nodeB = nodes[j];
                const posB = positions.get(nodeB.id);
                const velB = velocities.get(nodeB.id);
                const radiusA = getNodeHitMetrics(nodeA).collisionRadius;
                const radiusB = getNodeHitMetrics(nodeB).collisionRadius;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const distSq = Math.max(dx * dx + dy * dy, 120);
                const dist = Math.sqrt(distSq);
                const repulsionScale = nodeA.entity === "circle" || nodeB.entity === "circle" ? 1.9 : 1;
                const force = (repulsion * repulsionScale) / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                velA.x -= fx;
                velA.y -= fy;
                velB.x += fx;
                velB.y += fy;

                const minimumGap = radiusA + radiusB + (nodeA.entity === "circle" || nodeB.entity === "circle" ? 44 : 12);
                if (dist < minimumGap) {
                    const overlap = (minimumGap - dist) * 0.06;
                    const pushX = (dx / dist) * overlap;
                    const pushY = (dy / dist) * overlap;
                    velA.x -= pushX;
                    velA.y -= pushY;
                    velB.x += pushX;
                    velB.y += pushY;
                }
            }
        }

        edges.forEach((edge) => {
            const posA = positions.get(edge.source);
            const posB = positions.get(edge.target);
            const velA = velocities.get(edge.source);
            const velB = velocities.get(edge.target);

            if (!posA || !posB || !velA || !velB) {
                return;
            }

            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            let targetDist = 120;
            if (edge.type === "affiliation") {
                targetDist = 165;
            } else if (edge.type === "membership") {
                targetDist = 175;
            }
            const force = (dist - targetDist) * spring;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            velA.x += fx;
            velA.y += fy;
            velB.x -= fx;
            velB.y -= fy;

            if (edge.type === "membership") {
                const sourceNode = nodes.find((node) => node.id === edge.source);
                const targetNode = nodes.find((node) => node.id === edge.target);
                const circleNode = sourceNode?.entity === "circle" ? sourceNode : targetNode?.entity === "circle" ? targetNode : null;
                const personNode = sourceNode?.entity === "person" ? sourceNode : targetNode?.entity === "person" ? targetNode : null;
                if (circleNode && personNode) {
                    const circlePos = positions.get(circleNode.id);
                    const personPos = positions.get(personNode.id);
                    const personVel = velocities.get(personNode.id);
                    if (circlePos && personPos && personVel) {
                        const membershipSeed = hashString(`${circleNode.id}:${personNode.id}`);
                        const orbitAngle = (membershipSeed % 360) * (Math.PI / 180);
                        const orbitRadius = 110;
                        const anchorX = circlePos.x + (Math.cos(orbitAngle) * orbitRadius);
                        const anchorY = circlePos.y + (Math.sin(orbitAngle) * orbitRadius);
                        personVel.x += (anchorX - personPos.x) * 0.0025;
                        personVel.y += (anchorY - personPos.y) * 0.0025;
                    }
                }
            }
        });

        let kineticEnergy = 0;
        nodes.forEach((node) => {
            const pos = positions.get(node.id);
            const vel = velocities.get(node.id);
            if (node.id === draggedNodeId) {
                vel.x = 0;
                vel.y = 0;
                return;
            }
            const connectionBias = node.normalizedConnectionCount || 0;
            const nodeCenterPull = centerPull * (0.35 + (connectionBias * 1.25));

            vel.x += (width * 0.5 - pos.x) * nodeCenterPull;
            vel.y += (height * 0.5 - pos.y) * nodeCenterPull;

            vel.x *= damping;
            vel.y *= damping;

            pos.x = Math.min(width - boundaryPadding, Math.max(boundaryPadding, pos.x + vel.x));
            pos.y = Math.min(height - boundaryPadding, Math.max(boundaryPadding, pos.y + vel.y));
            
            kineticEnergy += vel.x * vel.x + vel.y * vel.y;
        });

        return kineticEnergy;
    }

    function renderLegend() {
        const legend = document.getElementById("topology-legend");
        if (!legend) {
            return;
        }

        legend.innerHTML = "";
        [
            { key: "relationship", label: "Relationships" },
            { key: "affiliation", label: "Affiliations" },
            { key: "membership", label: "Social Circle Memberships" },
        ].forEach((entry) => {
            const isVisible = state.topologyFilters.edgeVisibility?.[entry.key] !== false;
            const item = createNode("button", {
                className: `topology-legend__item${isVisible ? "" : " topology-legend__item--disabled"}`,
                attrs: { type: "button" },
            });
            const swatch = createNode("span", { className: "topology-legend__swatch" });
            const label = createNode("span", { className: "topology-legend__label", text: entry.label });
            swatch.style.backgroundColor = EDGE_COLORS[entry.key];
            item.appendChild(swatch);
            item.appendChild(label);
            item.addEventListener("click", () => {
                state.topologyFilters.edgeVisibility[entry.key] = !isVisible;
                renderTopology();
            });
            legend.appendChild(item);
        });

        const circleItem = createNode("div", { className: "topology-legend__item topology-legend__item--static" });
        const circleSwatch = createNode("span", { className: "topology-legend__swatch" });
        circleSwatch.style.backgroundColor = "#8b5f9f";
        circleItem.appendChild(circleSwatch);
        circleItem.appendChild(createNode("span", { className: "topology-legend__label", text: "Social Circles" }));
        legend.appendChild(circleItem);

        const showDeceased = state.topologyFilters.showDeceased !== false;
        const deceasedItem = createNode("button", {
            className: `topology-legend__item${showDeceased ? "" : " topology-legend__item--disabled"}`,
            attrs: { type: "button" },
        });
        const deceasedSwatch = createNode("span", { className: "topology-legend__swatch" });
        deceasedSwatch.style.backgroundColor = "#999";
        const deceasedLabel = createNode("span", { className: "topology-legend__label", text: "Show Deceased" });
        deceasedItem.appendChild(deceasedSwatch);
        deceasedItem.appendChild(deceasedLabel);
        deceasedItem.addEventListener("click", () => {
            state.topologyFilters.showDeceased = !showDeceased;
            renderTopology();
        });
        legend.appendChild(deceasedItem);
    }

    function drawGraph(graph) {
        const svg = document.getElementById("topology-graph");
        if (!svg) {
            return;
        }

        const { width, height } = getGraphDimensions(graph.nodes.length);
        simulationBounds = { width, height };
        activeGraphRef = graph;
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

        if (animationFrameId !== null) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        const nextLayoutSignature = graphLayoutSignature(graph);
        if (lastLayoutSignature !== nextLayoutSignature) {
            positions.clear();
            velocities.clear();
            lastLayoutSignature = nextLayoutSignature;
        }

        const renderFrame = () => {
            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }

            const viewportGroup = document.createElementNS(SVG_NS, "g");
            viewportGroup.setAttribute("transform", `translate(${viewport.tx}, ${viewport.ty}) scale(${viewport.scale})`);
            svg.appendChild(viewportGroup);
            viewportGroupRef = viewportGroup;

            graph.edges.forEach((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target || !nodesById.has(edge.source) || !nodesById.has(edge.target)) {
                    return;
                }

                const isConnectedToHoveredNode = hoveredNodeId && (edge.source === hoveredNodeId || edge.target === hoveredNodeId);
                const hasHoverFocus = Boolean(hoveredNodeId);

                const geometry = computeEdgeGeometry(edge, positions, nodesById, graph.nodes);
                if (!geometry) {
                    return;
                }

                const path = document.createElementNS(SVG_NS, "path");
                path.setAttribute("d", geometry.path);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", EDGE_COLORS[edge.type] || "#888");
                path.setAttribute("stroke-width", String(edge.weight ? Math.min(7, 1 + edge.weight * 0.45) : 2));
                path.setAttribute("opacity", hasHoverFocus ? (isConnectedToHoveredNode ? "1" : "0.18") : "0.78");
                if (isConnectedToHoveredNode) {
                    path.setAttribute("stroke-width", String((edge.weight ? Math.min(7, 1 + edge.weight * 0.45) : 2) + 1.25));
                }
                viewportGroup.appendChild(path);

                if (edge.emoji) {
                    const emoji = document.createElementNS(SVG_NS, "text");
                    emoji.textContent = edge.emoji;
                    emoji.setAttribute("x", String(geometry.labelPoint.x));
                    emoji.setAttribute("y", String(geometry.labelPoint.y - 4));
                    emoji.setAttribute("text-anchor", "middle");
                    emoji.setAttribute("font-size", "16");
                    viewportGroup.appendChild(emoji);
                }
            });

            graph.nodes.forEach((node) => {
                const pos = positions.get(node.id);
                if (!pos) {
                    return;
                }

                const metrics = getNodeHitMetrics(node);
                const isHovered = hoveredNodeId === node.id;
                const isAdjacentToHovered = hoveredNodeId && graph.edges.some((edge) => {
                    return (edge.source === hoveredNodeId && edge.target === node.id)
                        || (edge.target === hoveredNodeId && edge.source === node.id);
                });
                const shouldFade = hoveredNodeId && !isHovered && !isAdjacentToHovered;

                const group = document.createElementNS(SVG_NS, "g");
                group.setAttribute("class", "topology-node");
                group.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
                group.setAttribute("opacity", shouldFade ? "0.32" : "1");
                group.dataset.nodeId = node.id;
                group.dataset.entity = node.entity;
                group.dataset.entityId = String(node.entityId);

                const hitbox = document.createElementNS(SVG_NS, "rect");
                hitbox.setAttribute("x", String(metrics.left));
                hitbox.setAttribute("y", String(metrics.top));
                hitbox.setAttribute("width", String(metrics.right - metrics.left));
                hitbox.setAttribute("height", String(metrics.bottom - metrics.top));
                hitbox.setAttribute("rx", "12");
                hitbox.setAttribute("fill", "transparent");
                group.appendChild(hitbox);

                const circle = document.createElementNS(SVG_NS, "circle");
                let radius = 16;
                let fill = "#d9ece0";
                let stroke = "#588868";
                
                if (node.entity === "brand") {
                    radius = 19;
                    fill = "#f0d5bc";
                    stroke = "#b86a37";
                } else if (node.entity === "circle") {
                    radius = 22;
                    fill = "#ede0f5";
                    stroke = "#8b5f9f";
                }
                
                circle.setAttribute("r", String(radius));
                circle.setAttribute("fill", fill);
                circle.setAttribute("stroke", stroke);
                circle.setAttribute("stroke-width", isHovered || isAdjacentToHovered ? "3.5" : "2");
                group.appendChild(circle);

                const initials = document.createElementNS(SVG_NS, "text");
                initials.textContent = node.label
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                initials.setAttribute("text-anchor", "middle");
                initials.setAttribute("dy", "5");
                initials.setAttribute("font-size", "10");
                initials.setAttribute("font-weight", "700");
                group.appendChild(initials);

                const label = document.createElementNS(SVG_NS, "text");
                label.setAttribute("text-anchor", "middle");
                label.setAttribute("y", String(metrics.labelTopOffset));
                label.setAttribute("font-size", "12");
                label.setAttribute("class", "topology-node-label");
                metrics.labelLines.forEach((line, index) => {
                    const tspan = document.createElementNS(SVG_NS, "tspan");
                    tspan.textContent = line;
                    tspan.setAttribute("x", "0");
                    if (index === 0) {
                        tspan.setAttribute("dy", "0");
                    } else {
                        tspan.setAttribute("dy", String(metrics.lineHeight));
                    }
                    label.appendChild(tspan);
                });
                group.appendChild(label);

                viewportGroup.appendChild(group);
            });
        };

        renderFrameRef = renderFrame;

        if (!graphHandlersBound) {
            graphHandlersBound = true;
            let isPanning = false;
            let lastPanPoint = null;

            svg.addEventListener("wheel", (event) => {
                event.preventDefault();
                const pointer = getSvgPoint(event, svg);
                const scaleFactor = event.deltaY < 0 ? 1.08 : 0.92;
                const nextScale = Math.min(3.5, Math.max(0.35, viewport.scale * scaleFactor));

                const localX = (pointer.x - viewport.tx) / viewport.scale;
                const localY = (pointer.y - viewport.ty) / viewport.scale;

                viewport.scale = nextScale;
                viewport.tx = pointer.x - localX * viewport.scale;
                viewport.ty = pointer.y - localY * viewport.scale;

                if (renderFrameRef) {
                    renderFrameRef();
                }
            }, { passive: false });

            svg.addEventListener("mousedown", (event) => {
                if (event.button !== 0) {
                    return;
                }

                const targetNode = findNodeGroup(event.target);
                if (targetNode) {
                    const nodeId = targetNode.dataset.nodeId;
                    const draggedPos = positions.get(nodeId);
                    if (!nodeId || !draggedPos) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    isPanning = false;
                    draggedNodeId = nodeId;
                    const worldPoint = getPointerWorldPosition(event, svg);
                    const boundaryPadding = getSimulationPadding(activeGraphRef?.nodes.length || 1);
                    draggedPos.x = Math.min(
                        simulationBounds.width - boundaryPadding,
                        Math.max(boundaryPadding, worldPoint.x)
                    );
                    draggedPos.y = Math.min(
                        simulationBounds.height - boundaryPadding,
                        Math.max(boundaryPadding, worldPoint.y)
                    );
                    const draggedVelocity = velocities.get(nodeId);
                    if (draggedVelocity) {
                        draggedVelocity.x = 0;
                        draggedVelocity.y = 0;
                    }
                    svg.style.cursor = "grabbing";
                    scheduleSimulation();
                    return;
                }

                event.preventDefault();
                isPanning = true;
                lastPanPoint = getSvgPoint(event, svg);
                svg.style.cursor = "grabbing";
            });

            svg.addEventListener("dblclick", async (event) => {
                const targetNode = findNodeGroup(event.target);
                if (!targetNode) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                const entity = targetNode.dataset.entity;
                const entityId = Number(targetNode.dataset.entityId);
                if (!entityId || entity === "circle") {
                    return;
                }

                if (entity === "person") {
                    await actions.openPersonFromContext(entityId);
                    return;
                }

                if (entity === "brand") {
                    await actions.openBrandFromContext(entityId);
                }
            });

            svg.addEventListener("mousemove", (event) => {
                if (draggedNodeId || isPanning) {
                    if (hoveredNodeId !== null) {
                        hoveredNodeId = null;
                        if (renderFrameRef) {
                            renderFrameRef();
                        }
                    }
                    return;
                }

                const targetNode = findNodeGroup(event.target);
                const nextHoveredNodeId = targetNode?.dataset.nodeId || null;
                if (hoveredNodeId === nextHoveredNodeId) {
                    return;
                }

                hoveredNodeId = nextHoveredNodeId;
                if (renderFrameRef) {
                    renderFrameRef();
                }
            });

            svg.addEventListener("mouseleave", () => {
                if (hoveredNodeId === null) {
                    return;
                }

                hoveredNodeId = null;
                if (renderFrameRef) {
                    renderFrameRef();
                }
            });

            window.addEventListener("mousemove", (event) => {
                if (draggedNodeId) {
                    const draggedPos = positions.get(draggedNodeId);
                    const draggedVelocity = velocities.get(draggedNodeId);
                    if (draggedPos) {
                        const worldPoint = getPointerWorldPosition(event, svg);
                        const boundaryPadding = getSimulationPadding(activeGraphRef?.nodes.length || 1);
                        draggedPos.x = Math.min(
                            simulationBounds.width - boundaryPadding,
                            Math.max(boundaryPadding, worldPoint.x)
                        );
                        draggedPos.y = Math.min(
                            simulationBounds.height - boundaryPadding,
                            Math.max(boundaryPadding, worldPoint.y)
                        );
                        if (draggedVelocity) {
                            draggedVelocity.x = 0;
                            draggedVelocity.y = 0;
                        }
                        if (renderFrameRef) {
                            renderFrameRef();
                        }
                    }
                    return;
                }
                if (!isPanning) {
                    return;
                }
                const currentPanPoint = getSvgPoint(event, svg);
                const panDelta = getPanDelta(currentPanPoint, lastPanPoint);
                viewport.tx += panDelta.x;
                viewport.ty += panDelta.y;
                lastPanPoint = currentPanPoint;
                if (renderFrameRef) {
                    renderFrameRef();
                }
            });

            window.addEventListener("mouseup", () => {
                if (draggedNodeId) {
                    const releasedVelocity = velocities.get(draggedNodeId);
                    if (releasedVelocity) {
                        releasedVelocity.x = 0;
                        releasedVelocity.y = 0;
                    }
                    draggedNodeId = null;
                    svg.style.cursor = "default";
                    scheduleSimulation();
                }
                if (!isPanning) {
                    return;
                }
                isPanning = false;
                lastPanPoint = null;
                svg.style.cursor = "default";
            });
        }

        graph.nodes.forEach((node) => ensurePosition(node, width, height));
        renderFrame();
        scheduleSimulation(graph);
    }

    function bindFilterHandlers() {
        if (handlersBound) {
            return;
        }
        handlersBound = true;

        const relationSelect = document.getElementById("topology-filter-relationship-type");
        const circleSelect = document.getElementById("topology-filter-circle");
        const brandSelect = document.getElementById("topology-filter-brand");

        [
            [relationSelect, "relationshipType"],
            [circleSelect, "socialCircleId"],
            [brandSelect, "brandId"],
        ].forEach(([selectNode, key]) => {
            if (!selectNode) {
                return;
            }
            selectNode.addEventListener("change", () => {
                state.topologyFilters[key] = selectNode.value;
                renderTopology();
            });
        });
    }

    function syncFilterOptions() {
        const relationSelect = document.getElementById("topology-filter-relationship-type");
        const circleSelect = document.getElementById("topology-filter-circle");
        const brandSelect = document.getElementById("topology-filter-brand");

        if (!relationSelect || !circleSelect || !brandSelect) {
            return;
        }

        relationSelect.innerHTML = "";
        circleSelect.innerHTML = "";
        brandSelect.innerHTML = "";

        const relationOptions = [
            { value: "", label: "All relationship types" },
            ...(state.data.typeLists.relationshipTypes || []).map((entry) => ({
                value: entry.name,
                label: `${entry.emoji || ""} ${entry.name}`.trim(),
            })),
        ];

        const circleOptions = [
            { value: "", label: "All social circles" },
            ...state.data.circles.map((circle) => ({ value: String(circle.id), label: circle.name })),
        ];

        const brandOptions = [
            { value: "", label: "All brands" },
            ...state.data.brands.map((brand) => ({ value: String(brand.id), label: brand.name })),
        ];

        relationOptions.forEach((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            relationSelect.appendChild(node);
        });
        circleOptions.forEach((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            circleSelect.appendChild(node);
        });
        brandOptions.forEach((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            brandSelect.appendChild(node);
        });

        relationSelect.value = state.topologyFilters.relationshipType || "";
        circleSelect.value = state.topologyFilters.socialCircleId || "";
        brandSelect.value = state.topologyFilters.brandId || "";
    }

    function renderTopology() {
        const section = document.getElementById("section-topology");
        if (!section) {
            return;
        }

        if (state.activeSection !== "topology") {
            if (animationFrameId !== null) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            return;
        }

        bindFilterHandlers();
        syncFilterOptions();
        renderLegend();

        const graph = applyFilters(buildGraph());
        drawGraph(graph);
    }

    return {
        renderTopology,
    };
}
