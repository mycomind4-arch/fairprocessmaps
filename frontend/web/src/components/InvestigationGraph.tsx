"use client";

import { useMemo, useState, useCallback } from "react";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  highlightedNodes: Set<string>;
  onNodeClick: (id: string) => void;
}

// Node type colors
const NODE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  property: { fill: "#1e3a5f", stroke: "#3b82f6", label: "Property" },
  case: { fill: "#1e2d5f", stroke: "#6366f1", label: "Case" },
  evidence: { fill: "#1e3d4f", stroke: "#06b6d4", label: "Evidence" },
  finding: { fill: "#3d1e1e", stroke: "#ef4444", label: "Finding" },
  event: { fill: "#3d2e1e", stroke: "#f59e0b", label: "Event" },
  statute: { fill: "#2e1e3d", stroke: "#a78bfa", label: "Statute" },
  official: { fill: "#1e3d2e", stroke: "#10b981", label: "Official" },
  department: { fill: "#1e3d2e", stroke: "#14b8a6", label: "Department" },
  authority: { fill: "#2e1e3d", stroke: "#a78bfa", label: "Authority" },
  permit: { fill: "#1e2d4f", stroke: "#3b82f6", label: "Permit" },
  ce_case: { fill: "#3d1e2e", stroke: "#ec4899", label: "CE Case" },
  owner: { fill: "#1e3d4f", stroke: "#14b8a6", label: "Owner" },
};

// Force-directed layout (simplified — circular with case at center)
function layoutNodes(nodes: GraphNode[], caseId: string | null): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  // Case node at center
  const centerNode = nodes.find((n) => n.id === caseId) || nodes[0];
  if (centerNode) {
    positions.set(centerNode.id, { x: 400, y: 200 });
  }

  // Other nodes in concentric rings by type
  const otherNodes = nodes.filter((n) => n.id !== centerNode.id);
  const byType = new Map<string, GraphNode[]>();
  for (const n of otherNodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }

  const types = Array.from(byType.keys());
  const typeCount = types.length;
  const radiusStep = 120;
  const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);

  let nodeIndex = 0;
  for (let t = 0; t < typeCount; t++) {
    const typeNodes = byType.get(types[t])!;
    const ringRadius = radiusStep + t * 80;
    for (const node of typeNodes) {
      const angle = nodeIndex * angleStep + (t * Math.PI) / typeCount;
      positions.set(node.id, {
        x: 400 + ringRadius * Math.cos(angle),
        y: 200 + ringRadius * Math.sin(angle),
      });
      nodeIndex++;
    }
  }

  return positions;
}

export default function InvestigationGraph({
  nodes,
  edges,
  selectedNode,
  highlightedNodes,
  onNodeClick,
}: Props) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const caseId = useMemo(() => {
    const caseNode = nodes.find((n) => n.type === "case");
    return caseNode?.id ?? null;
  }, [nodes]);

  const positions = useMemo(() => layoutNodes(nodes, caseId), [nodes, caseId]);

  const isHighlighted = useCallback(
    (id: string) => highlightedNodes.size > 0 && (highlightedNodes.has(id) || (highlightedNodes.size === 0)),
    [highlightedNodes],
  );

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-fp-text-dim text-sm">
        No nodes to display
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden relative">
      <svg
        viewBox="0 0 800 400"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;

          const isEdgeHovered = hoveredEdge === `${edge.source}-${edge.target}-${i}`;
          const isConnected =
            highlightedNodes.size === 0 ||
            highlightedNodes.has(edge.source) ||
            highlightedNodes.has(edge.target);
          const isSemantic = edge.provenance?.source === "relationship_table";

          return (
            <g key={`edge-${i}`}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={isEdgeHovered ? "#06b6d4" : isSemantic ? "#a78bfa" : "#3b82f6"}
                strokeWidth={isEdgeHovered ? 2 : 1}
                strokeOpacity={isConnected ? (isSemantic ? 0.5 : 0.3) : 0.1}
                strokeDasharray={isSemantic ? "4 2" : "none"}
                onMouseEnter={() => setHoveredEdge(`${edge.source}-${edge.target}-${i}`)}
                onMouseLeave={() => setHoveredEdge(null)}
                style={{ cursor: "pointer" }}
              />
              {isEdgeHovered && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 5}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  {edge.type_label || edge.type}
                  {edge.provenance?.confidence != null && ` (${(edge.provenance.confidence * 100).toFixed(0)}%)`}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const color = NODE_COLORS[node.type] || { fill: "#1e2d4f", stroke: "#64748b", label: node.type };
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const isDimmed = highlightedNodes.size > 0 && !highlightedNodes.has(node.id);
          const radius = node.type === "case" ? 28 : node.type === "property" ? 24 : 18;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onNodeClick(node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", opacity: isDimmed ? 0.3 : 1 }}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle r={radius + 6} fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
              )}
              {isHovered && !isSelected && (
                <circle r={radius + 4} fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              )}

              {/* Node circle */}
              <circle
                r={radius}
                fill={color.fill}
                stroke={isSelected ? "#06b6d4" : color.stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={isDimmed ? 0.3 : 1}
              />

              {/* Node type label (inside) */}
              <text
                y={radius + 12}
                fill="#94a3b8"
                fontSize="9"
                textAnchor="middle"
                className="pointer-events-none select-none"
              >
                {color.label}
              </text>

              {/* Node label (below) */}
              {node.label && (
                <text
                  y={radius + 24}
                  fill="#e2e8f0"
                  fontSize="10"
                  textAnchor="middle"
                  className="pointer-events-none select-none"
                  style={{ maxWidth: "80px" }}
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 bg-fp-surface/80 backdrop-blur rounded-lg border border-fp-border px-3 py-2 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-fp-blue" />
          <span className="text-fp-text-dim">Derived edge</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-fp-purple" />
          <span className="text-fp-text-dim">Semantic edge (dashed)</span>
        </div>
      </div>
    </div>
  );
}
