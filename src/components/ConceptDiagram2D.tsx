import { useState } from 'react';
import type { ConceptDiagramSpec, DiagramNode } from '../types/tutor';

interface ConceptDiagram2DProps {
  conceptTitle: string;
  recommendation: string;
  diagram: ConceptDiagramSpec;
  onReturnToTurbofan: () => void;
}

interface PositionedNode {
  readonly node: DiagramNode;
  readonly x: number;
  readonly y: number;
}

const NODE_W = 136;
const NODE_H = 54;
const SVG_W = 780;
const SVG_H = 340;

function distributeRowX(rowCount: number, marginX = 100): number[] {
  if (rowCount <= 1) return [SVG_W / 2];
  const usable = SVG_W - marginX * 2;
  const step = usable / (rowCount - 1);
  return Array.from({ length: rowCount }, (_, i) => marginX + step * i);
}

function computeNodePositions(diagram: ConceptDiagramSpec): PositionedNode[] {
  const count = diagram.nodes.length;
  if (count === 0) return [];

  if (diagram.layout === 'cycle' && count >= 3) {
    const cx = SVG_W / 2;
    const cy = SVG_H / 2;
    const rx = 250;
    const ry = 105;
    return diagram.nodes.map((node, idx) => {
      const angle = -Math.PI / 2 + (idx / count) * Math.PI * 2;
      return {
        node,
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      };
    });
  }

  if (diagram.layout === 'hierarchy' && count >= 3) {
    const root = diagram.nodes[0];
    const children = diagram.nodes.slice(1);
    const xs = distributeRowX(children.length, children.length <= 2 ? 200 : 100);
    return [
      { node: root, x: SVG_W / 2, y: 74 },
      ...children.map((node, idx) => ({
        node,
        x: xs[idx],
        y: 238,
      })),
    ];
  }

  // Default 'flow' layout: spacious 1-row or 2-row grid
  if (count <= 3) {
    const xs = distributeRowX(count, count === 2 ? 200 : 100);
    return diagram.nodes.map((node, idx) => ({
      node,
      x: xs[idx],
      y: SVG_H / 2,
    }));
  }

  const topCount = Math.ceil(count / 2);
  const bottomCount = count - topCount;
  const topXs = distributeRowX(topCount, topCount <= 2 ? 200 : 96);
  const bottomXs = distributeRowX(bottomCount, bottomCount <= 2 ? 200 : 96);

  return diagram.nodes.map((node, idx) => {
    if (idx < topCount) {
      return { node, x: topXs[idx], y: 88 };
    }
    const bIdx = idx - topCount;
    return { node, x: bottomXs[bIdx], y: 244 };
  });
}

function getCategoryAccent(category: DiagramNode['category']) {
  if (category === 'energy') {
    return { stroke: '#f59e0b', fill: '#2a1a08', badge: '#fbbf24' };
  }
  if (category === 'secondary') {
    return { stroke: '#64748b', fill: '#111827', badge: '#cbd5e1' };
  }
  return { stroke: '#22d3ee', fill: '#0b2235', badge: '#67e8f9' };
}

/**
 * Interactive 2D SVG component diagram rendered whenever Gemini identifies
 * an object or system outside the 3D jet propulsion engine.
 */
export function ConceptDiagram2D({
  conceptTitle,
  recommendation,
  diagram,
  onReturnToTurbofan,
}: ConceptDiagram2DProps) {
  const positioned = computeNodePositions(diagram);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    positioned[0]?.node.id ?? '',
  );

  const posById = new Map(positioned.map((p) => [p.node.id, p]));
  const selectedNode =
    positioned.find((p) => p.node.id === selectedNodeId)?.node ?? positioned[0]?.node;

  const computedEdges = diagram.edges
    .map((edge, idx) => {
      const from = posById.get(edge.fromId);
      const to = posById.get(edge.toId);
      if (!from || !to) return null;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;

      // Exact intersection distance to the outer border of each node rectangle
      const halfW = NODE_W / 2 + 6;
      const halfH = NODE_H / 2 + 6;
      const boxPad = Math.min(
        Math.abs(ux) > 0.001 ? halfW / Math.abs(ux) : Number.POSITIVE_INFINITY,
        Math.abs(uy) > 0.001 ? halfH / Math.abs(uy) : Number.POSITIVE_INFINITY,
      );
      const clampedPad = Math.min(boxPad, dist * 0.42);

      const x1 = from.x + ux * clampedPad;
      const y1 = from.y + uy * clampedPad;
      const x2 = to.x - ux * clampedPad;
      const y2 = to.y - uy * clampedPad;

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - (Math.abs(uy) < 0.25 ? 14 : 0);
      const labelText = edge.label
        ? edge.label.length > 22
          ? `${edge.label.slice(0, 20)}…`
          : edge.label
        : '';
      const labelWidth = Math.max(48, labelText.length * 6.1 + 14);

      return {
        key: `${edge.fromId}-${edge.toId}-${idx}`,
        x1,
        y1,
        x2,
        y2,
        mx,
        my,
        labelText,
        labelWidth,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  return (
    <div
      data-testid="concept-diagram-2d"
      className="flex-1 min-h-0 flex flex-col justify-between bg-[#0A0F1A] border border-amber-500/35 rounded-md p-3.5 gap-3 overflow-y-auto studio-scroll"
    >
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-[11px] font-mono text-amber-300">
            No 3D Engine Model Applicable · Interactive 2D Component Diagram
          </p>
          <h3 className="font-display text-sm font-semibold text-slate-100">
            {diagram.title || conceptTitle}
          </h3>
        </div>
        <button
          type="button"
          onClick={onReturnToTurbofan}
          className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Return to 3D Turbofan
        </button>
      </div>

      {/* Interactive SVG Diagram Canvas */}
      <div className="flex-1 min-h-[210px] flex items-center justify-center bg-[#070B13] border border-slate-800/90 rounded p-2">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full max-h-[280px] select-none"
          role="img"
          aria-label={`2D component diagram for ${diagram.title}`}
        >
          <defs>
            <marker
              id="diagram-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>

          {/* Edge Arrows (behind nodes) */}
          {computedEdges.map((edge) => (
            <line
              key={`line-${edge.key}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke="#38bdf8"
              strokeOpacity="0.72"
              strokeWidth="1.9"
              markerEnd="url(#diagram-arrow)"
            />
          ))}

          {/* Clickable Component Nodes */}
          {positioned.map(({ node, x, y }) => {
            const isSelected = selectedNode?.id === node.id;
            const accent = getCategoryAccent(node.category);
            return (
              <g
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className="cursor-pointer"
              >
                <rect
                  x={x - NODE_W / 2}
                  y={y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx="6"
                  fill={accent.fill}
                  stroke={isSelected ? '#22d3ee' : accent.stroke}
                  strokeWidth={isSelected ? '2.4' : '1.3'}
                />
                <text
                  x={x}
                  y={y - 4}
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="11.5"
                  fontWeight="600"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                </text>
                <text
                  x={x}
                  y={y + 14}
                  textAnchor="middle"
                  fill={accent.badge}
                  fontSize="9.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {node.category.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Edge Labels (top layer so labels remain legible across dense flows) */}
          {computedEdges.map((edge) =>
            edge.labelText ? (
              <g key={`label-${edge.key}`} className="pointer-events-none">
                <rect
                  x={edge.mx - edge.labelWidth / 2}
                  y={edge.my - 9}
                  width={edge.labelWidth}
                  height={16}
                  rx="3"
                  fill="#070B13"
                  fillOpacity="0.94"
                  stroke="#1e293b"
                  strokeWidth="0.7"
                />
                <text
                  x={edge.mx}
                  y={edge.my + 2}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="9.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {edge.labelText}
                </text>
              </g>
            ) : null,
          )}
        </svg>
      </div>

      {/* Selected Diagram Node Detail */}
      {selectedNode && (
        <div className="shrink-0 bg-[#0C111D] border border-slate-800 rounded p-2.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-cyan-300">
              Component: {selectedNode.label}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Click any node to inspect
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{selectedNode.role}</p>
          <p className="text-[11px] text-slate-500">
            Recommended visualization: {recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
