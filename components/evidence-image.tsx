"use client";

import { useRef, useState, type PointerEvent } from "react";

export type BBox = { x: number; y: number; w: number; h: number };

export type Overlay = {
  id: string;
  bbox: BBox;
  label: string;
  /** solid = confirmed, dashed = AI-inferred, dotted = unresolved (Design system §8.4). */
  line: "solid" | "dashed" | "dotted";
  tone: "accent" | "added" | "removed" | "changed" | "unknown" | "muted";
  selected?: boolean;
};

const TONE: Record<Overlay["tone"], string> = {
  accent: "var(--brand)",
  added: "var(--added)",
  removed: "var(--removed)",
  changed: "var(--changed)",
  unknown: "var(--unknown)",
  muted: "var(--text-secondary)",
};
const DASH: Record<Overlay["line"], string | undefined> = { solid: undefined, dashed: "6 4", dotted: "1.5 4" };

/**
 * Photo with normalized-coordinate overlays. The SVG uses the image's own
 * aspect ratio and sits exactly on the rendered <img>, so boxes never drift
 * into letterboxing. Optional draw mode lets the user mark a region.
 */
export function EvidenceImage({
  src,
  width,
  height,
  alt,
  overlays,
  onSelect,
  drawMode,
  onDraw,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  overlays: Overlay[];
  onSelect?: (id: string) => void;
  drawMode?: boolean;
  onDraw?: (bbox: BBox) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);

  const point = (e: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  return (
    <figure className="relative">
      <div className="relative overflow-hidden rounded-xl border border-line bg-raised" style={{ aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private local image served by our API */}
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full select-none" draggable={false} />
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className={`absolute inset-0 h-full w-full ${drawMode ? "cursor-crosshair touch-none" : ""}`}
          onPointerDown={(e) => {
            if (!drawMode) return;
            const p = point(e);
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, ...{ x1: point(e).x, y1: point(e).y } })}
          onPointerUp={() => {
            if (!drag) return;
            const b = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
            setDrag(null);
            if (b.w > 0.01 && b.h > 0.01) onDraw?.(b);
          }}
        >
          {showOverlays &&
            overlays.map((o) => (
              <g key={o.id} onClick={() => !drawMode && onSelect?.(o.id)} className={onSelect && !drawMode ? "cursor-pointer" : ""}>
                <rect
                  x={o.bbox.x}
                  y={o.bbox.y}
                  width={o.bbox.w}
                  height={o.bbox.h}
                  fill={o.selected ? TONE[o.tone] : "transparent"}
                  fillOpacity={o.selected ? 0.15 : 0}
                  stroke={TONE[o.tone]}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={DASH[o.line]}
                  style={{ strokeWidth: o.selected ? 4 : 2 }}
                />
              </g>
            ))}
          {drag && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
              fill="var(--brand)"
              fillOpacity={0.15}
              stroke="var(--brand)"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 2 }}
            />
          )}
        </svg>
        {showOverlays &&
          overlays
            .filter((o) => o.selected)
            .map((o) => (
              <span
                key={`label-${o.id}`}
                className="pointer-events-none absolute rounded-md bg-label px-1.5 py-0.5 text-xs font-medium text-white shadow"
                style={{ left: `${o.bbox.x * 100}%`, top: `${Math.max(0, o.bbox.y * 100 - 4)}%` }}
              >
                {o.label}
              </span>
            ))}
      </div>
      <figcaption className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>{alt}</span>
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowOverlays((v) => !v)}>
          {showOverlays ? "Hide overlays" : "Show overlays"}
        </button>
      </figcaption>
    </figure>
  );
}
