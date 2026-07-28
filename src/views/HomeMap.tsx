import { forwardRef } from "react";
import { BOX_HEIGHT, buildHomeMap, type MapBox, type MapTier } from "../domain/homeMap";
import type { EvaluationQuestion } from "../domain/schema";

/**
 * The Home Window map-with-lines (Slice 9, J13 — R-125). Renders `buildHomeMap`
 * as an SVG: Overall Judgement on top, meso layer(s), evidence, sub-methods,
 * connected by lines; every box is a clickable drill-in target (R-126). The same
 * SVG is what the SVG/PNG export serialises (R-124, ⚠Q52) — so colours are
 * presentation attributes (self-contained, no external CSS needed to reproduce).
 */

const TIER_STYLE: Record<MapTier, { fill: string; stroke: string }> = {
  judgement: { fill: "#fdf6e9", stroke: "#c47f17" },
  superior: { fill: "#fdf6e9", stroke: "#c47f17" },
  subordinate: { fill: "#fdf6e9", stroke: "#c47f17" },
  evidence: { fill: "#edf5ec", stroke: "#3a7d44" },
  submethod: { fill: "#f7f6f2", stroke: "#b8b4a8" },
};

/** Trim a label to what fits the box width, keeping the full text in <title>. */
function fitText(label: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 14) / 7));
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export const HomeMap = forwardRef<
  SVGSVGElement,
  {
    doc: EvaluationQuestion;
    onActivate: (box: MapBox) => void;
  }
>(function HomeMap({ doc, onActivate }, ref) {
  const map = buildHomeMap(doc);
  if (map.boxes.length === 0) return null;
  const byId = new Map(map.boxes.map((b) => [b.id, b]));

  return (
    <svg
      ref={ref}
      className="home-map-svg"
      data-testid="home-map"
      viewBox={`0 0 ${map.width} ${map.height}`}
      width={map.width}
      height={map.height}
      role="group"
      aria-label="Framework map"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={map.width} height={map.height} fill="#ffffff" />
      {map.edges.map((e) => {
        const from = byId.get(e.fromId)!;
        const to = byId.get(e.toId)!;
        return (
          <line
            key={`${e.fromId}->${e.toId}`}
            className="home-map-edge"
            x1={from.x + from.width / 2}
            y1={from.y + from.height}
            x2={to.x + to.width / 2}
            y2={to.y}
            stroke="#b8b4a8"
            strokeWidth={1.5}
          />
        );
      })}
      {map.boxes.map((b) => {
        const style = TIER_STYLE[b.tier];
        return (
          <g
            key={b.id}
            className="home-map-box"
            data-testid={b.testId}
            transform={`translate(${b.x}, ${b.y})`}
            role="button"
            tabIndex={0}
            onClick={() => onActivate(b)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onActivate(b);
              }
            }}
          >
            <title>
              {b.kindLabel}: {b.label || "(unnamed)"}
            </title>
            <rect
              width={b.width}
              height={BOX_HEIGHT}
              rx={6}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={2}
            />
            <text
              x={b.width / 2}
              y={17}
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
              fontSize={9}
              fill="#666666"
              style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              {b.kindLabel}
            </text>
            <text
              x={b.width / 2}
              y={34}
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
              fontSize={13}
              fontWeight={600}
              fill="#1a1a1a"
            >
              {fitText(b.label || "(unnamed)", b.width)}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

/** Serialise the map SVG to a standalone document string (R-124 SVG export). */
export function serializeMapSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Rasterise the map SVG to a PNG blob at 2× for a crisp export (R-124). */
export function mapSvgToPngBlob(svg: SVGSVGElement): Promise<Blob> {
  const svgString = serializeMapSvg(svg);
  const width = svg.viewBox.baseVal.width || svg.clientWidth;
  const height = svg.viewBox.baseVal.height || svg.clientHeight;
  const url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no 2d context"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image load failed"));
    };
    image.src = url;
  });
}
