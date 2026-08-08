"use client";

import { useMemo, useState, useCallback } from "react";
import type { GraphNode, GraphEdge, EdgeProvenance } from "@/lib/graph/types";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  highlightedNodes: Set<string>;
  onNodeClick: (id: string) => void;
}

const NODE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  property:   { fill: "#1e3a5f", stroke: "#3b82f6", label: "Property" },
  case:       { fill: "#1e2d5f", stroke: "#6366f1", label: "Case" },
  evidence:   { fill: "#1e3d4f", stroke: "#06b6d4", label: "Evidence" },
  finding:    { fill: "#3d1e1e", stroke: "#ef4444", label: "Finding" },
  event:      { fill: "#3d2e1e", stroke: "#f59e0b", label: "Event" },
  statute:    { fill: "#2e1e3d", stroke: "#a78bfa", label: "Statute" },
  official:   { fill: "#1e3d2e", stroke: "#10b981", label: "Official" },
  department: { fill: "#1e3d2e", stroke: "#14b8a6", label: "Department" },
  authority:  { fill: "#2e1e3d", stroke: "#a78bfa", label: "Authority" },
  permit:     { fill: "#1e2d4f", stroke: "#3b82f6", label: "Permit" },
  ce_case:    { fill: "#3d1e2e", stroke: "#ec4899", label: "CE Case" },
  owner:      { fill: "#1e3d4f", stroke: "#14b8a6", label: "Owner" },
};

// ── Hierarchical layout ──────────────────────────────────────────────────────
//
// The case node is at the top center. Property below it. Then evidence,
// findings, permits, CE cases radiate outward from property. Semantic
// edges (authority chains) form a vertical hierarchy below.

function layoutHierarchical(
  nodes: GraphNode[], edges: GraphEdge[], caseId: string | null,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const W = 800;
  const H = 400;

  // Layer 0: Case node at top center
  const caseNode = nodes.find(n => n.id === caseId);
  if (caseNode) positions.set(caseNode.id, { x: W / 2, y: 30 });

  // Layer 1: Property below case
  const propertyEdges = edges.filter(e =>
    (e.source === caseId && e.type === "case_property") ||
    (e.target === caseId && e.type === "case_property")
  );
  const propertyIds = propertyEdges.map(e => e.source === caseId ? e.target : e.source);
  const propertyNodes = propertyIds.length > 0
    ? propertyIds.map(id => nodes.find(n => n.id === id)).filter(Boolean) as GraphNode[]
    : [];
  for (let i = 0; i < propertyNodes.length; i++) {
    positions.set(propertyNodes[i].id, { x: W / 2, y: 90 });
  }

  // Layer 2: Evidence, Findings — children of case
  const evidenceNodes = nodes.filter(n => n.type === "evidence");
  const findingNodes = nodes.filter(n => n.type === "finding");
  const layer2Nodes = [...evidenceNodes, ...findingNodes];
  const layer2Spacing = Math.min(120, (W - 100) / Math.max(layer2Nodes.length, 1));
  const layer2Start = (W - (layer2Nodes.length - 1) * layer2Spacing) / 2;
  for (let i = 0; i < layer2Nodes.length; i++) {
    if (!positions.has(layer2Nodes[i].id)) {
      positions.set(layer2Nodes[i].id, { x: layer2Start + i * layer2Spacing, y: 170 });
    }
  }

  // Layer 3: Permits, CE Cases, Recorder — children of property
  const propertyNode = propertyNodes[0];
  const propertyId = propertyNode?.id;
  const permitNodes = nodes.filter(n => n.type === "permit");
  const ceNodes = nodes.filter(n => n.type === "ce_case");
  const eventNodes = nodes.filter(n => n.type === "event");
  const layer3Nodes = [...permitNodes, ...ceNodes, ...eventNodes];
  const layer3Spacing = Math.min(100, (W - 80) / Math.max(layer3Nodes.length, 1));
  const layer3Start = (W - (layer3Nodes.length - 1) * layer3Spacing) / 2;
  for (let i = 0; i < layer3Nodes.length; i++) {
    if (!positions.has(layer3Nodes[i].id)) {
      positions.set(layer3Nodes[i].id, { x: layer3Start + i * layer3Spacing, y: 240 });
    }
  }

  // Layer 4: Authority chain (statute, official, department, authority, owner)
  const authorityTypes = ["statute", "official", "department", "authority", "owner"];
  const authorityNodes = nodes.filter(n => authorityTypes.includes(n.type));
  const layer4Spacing = Math.min(90, (W - 60) / Math.max(authorityNodes.length, 1));
  const layer4Start = (W - (authorityNodes.length - 1) * layer4Spacing) / 2;
  for (let i = 0; i < authorityNodes.length; i++) {
    if (!positions.has(authorityNodes[i].id)) {
      positions.set(authorityNodes[i].id, { x: layer4Start + i * layer4Spacing, y: 310 });
    }
  }

  // Fallback: any unpositioned nodes
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      const idx = Array.from(positions.keys()).length;
      positions.set(node.id, { x: 50 + (idx * 60) % (W - 100), y: 360 });
    }
  }

  return positions;
}

export default function InvestigationGraph({
  nodes, edges, selectedNode, highlightedNodes, onNodeClick,
}: Props) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const caseId = useMemo(() => {
    const cn = nodes.find(n => n.type === "case");
    return cn?.id ?? null;
  }, [nodes]);

  const positions = useMemo(() => layoutHierarchical(nodes, edges, caseId), [nodes, edges, caseId]);

  // Sort by relevance for display priority
  const sortedNodes = useMemo(() =>
    [...nodes].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)),
  [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 py-16">
        No nodes to display
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden relative">
      <svg viewBox="0 0 800 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Investigation relationship graph">
        {/* Edges */}
        {edges.map((edge, i) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;

          const isHovered = hoveredEdge === `${edge.source}-${edge.target}-${i}`;
          const isConnected = highlightedNodes.size === 0 ||
            highlightedNodes.has(edge.source) || highlightedNodes.has(edge.target);
          const isSemantic = edge.provenance?.source === "relationship_table";
          const isRejected = edge.provenance?.status === "rejected";

          return (
            <g key={`edge-${i}`}>
              <line
                x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                stroke={isRejected ? "#ef4444" : isHovered ? "#3b82f6" : isSemantic ? "#a78bfa" : "#3b82f6"}
                strokeWidth={isHovered ? 2 : 1}
                strokeOpacity={isConnected ? (isSemantic ? 0.5 : 0.3) : 0.08}
                strokeDasharray={isSemantic ? "4 2" : isRejected ? "2 2" : "none"}
                onMouseEnter={() => setHoveredEdge(`${edge.source}-${edge.target}-${i}`)}
                onMouseLeave={() => setHoveredEdge(null)}
                style={{ cursor: "pointer" }}
              />
              {isHovered && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 5}
                  fill="#94a3b8" fontSize="10" textAnchor="middle"
                  className="pointer-events-none"
                >
                  {edge.type_label || edge.type}
                  {edge.provenance?.confidence != null && ` (${(edge.provenance.confidence * 100).toFixed(0)}%)`}
                  {isRejected && " ⚠ rejected"}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes — sorted by relevance so high-relevance renders on top */}
        {sortedNodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const color = NODE_COLORS[node.type] || { fill: "#1e2d4f", stroke: "#64748b", label: node.type };
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const isDimmed = highlightedNodes.size > 0 && !highlightedNodes.has(node.id);
          const relevance = node.relevance_score ?? 0;

          // Size based on relevance: 14-28px radius
          const baseRadius = node.type === "case" ? 26 : node.type === "property" ? 22 : 16;
          const radius = baseRadius + Math.round(relevance / 100 * 6);

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onNodeClick(node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.2s ease" }}
            >
              {isSelected && (
                <circle r={radius + 6} fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.6" />
              )}
              {isHovered && !isSelected && (
                <circle r={radius + 4} fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              )}

              <circle
                r={radius}
                fill={color.fill}
                stroke={isSelected ? "#3b82f6" : color.stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={isDimmed ? 0.25 : 1}
              />

              {/* Relevance indicator (small arc) */}
              {relevance >= 50 && (
                <circle
                  r={radius + 2} fill="none" stroke="#f59e0b"
                  strokeWidth="1" strokeOpacity="0.4"
                  strokeDasharray={`${(relevance / 100) * (2 * Math.PI * (radius + 2))} ${2 * Math.PI * (radius + 2)}`}
                  transform="rotate(-90)"
                  className="pointer-events-none"
                />
              )}

              <text
                y={radius + 12} fill="#94a3b8" fontSize="10" textAnchor="middle"
                className="pointer-events-none select-none"
              >
                {color.label}
              </text>
              {node.label && (
                <text
                  y={radius + 24} fill="#e2e8f0" fontSize="10" textAnchor="middle"
                  className="pointer-events-none select-none"
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
          <div className="w-3 h-0.5 bg-fp-blue" />
          <span className="text-fp-text-dim">Derived edge</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 border-t border-dashed border-fp-purple" />
          <span className="text-fp-text-dim">Semantic edge</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 border-t border-dashed border-fp-red" />
          <span className="text-fp-text-dim">Rejected edge</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full border border-fp-amber" />
          <span className="text-fp-text-dim">High relevance</span>
        </div>
      </div>
    </div>
  );
}
