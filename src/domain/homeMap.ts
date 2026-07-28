import {
  subordinateLayer,
  superiorLayer,
  synthesisLayer,
} from "./layers";
import type { EvaluationQuestion } from "./schema";

/**
 * The Home Window map (Slice 9, J13 — R-125–R-130). A pure layout of the whole
 * framework as a flowchart / map-with-lines: Overall Judgement on top (if made),
 * the meso layer(s) below, evidence beneath, sub-methods beneath that, connected
 * by lines (R-125). Kept pure so the tier banding, box sizing and edge wiring are
 * Vitest-testable without a DOM; `HomeMap.tsx` renders the result as SVG (which
 * is also what the SVG/PNG export serialises — R-124, closing ⚠Q52).
 *
 * Built **conservatively around ⚠Q53** — it draws today's actual behaviour (a
 * superior layer feeds the single Overall Judgement, Q4/Q49) and invents no new
 * inter-layer-synthesis semantics.
 */

export type MapTier = "judgement" | "superior" | "subordinate" | "evidence" | "submethod";

export interface MapBox {
  /** Globally unique box id (also the SVG element key / edge endpoint). */
  id: string;
  tier: MapTier;
  /** The clickable element's data-testid (kept stable for the drill-in tests). */
  testId: string;
  /** The small kind label (e.g. "Criterion", "Evidence / Method"). */
  kindLabel: string;
  /** The node/method display name. */
  label: string;
  /** The domain id the drill-in acts on (nodeId, methodId, …). */
  refId: string;
  /** The owning subordinate node, for evidence/sub-method drill-in routing. */
  nodeId?: string;
  /** The parent box this one hangs beneath (the edge target's source). */
  parentBoxId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapEdge {
  fromId: string;
  toId: string;
}

export interface HomeMap {
  boxes: MapBox[];
  edges: MapEdge[];
  width: number;
  height: number;
}

// ---- Layout constants (shared with the renderer) ----------------------------

export const BOX_HEIGHT = 48;
const V_GAP = 46;
const H_GAP = 18;
const MARGIN = 16;
const CHAR_W = 7.3;
const MIN_W = 96;
const MAX_W = 240;
const PAD_X = 26;

/** The vertical band order — abstraction level top→bottom. */
const TIER_LEVEL: Record<MapTier, number> = {
  judgement: 0,
  superior: 1,
  subordinate: 2,
  evidence: 3,
  submethod: 4,
};

function boxWidth(label: string, kindLabel: string): number {
  const chars = Math.max(label.length, kindLabel.length);
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(chars * CHAR_W + PAD_X)));
}

/**
 * Build the map for a document. Boxes carry logical fields + computed geometry;
 * edges connect each box to its parent. An empty framework yields an empty map.
 */
export function buildHomeMap(doc: EvaluationQuestion): HomeMap {
  const subordinate = subordinateLayer(doc);
  const superior = superiorLayer(doc);
  const judgement = doc.overallJudgement;
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));

  const boxes: MapBox[] = [];
  const push = (b: Omit<MapBox, "x" | "y" | "width" | "height">) =>
    boxes.push({ ...b, x: 0, y: 0, width: boxWidth(b.label, b.kindLabel), height: BOX_HEIGHT });

  // 1) Overall Judgement (top) — the single judgement the framework feeds (Q4).
  let judgementBoxId: string | undefined;
  if (judgement) {
    judgementBoxId = "judgement";
    const label =
      (judgement.freeTextOverride ?? "").trim() !== ""
        ? judgement.freeTextOverride!.trim()
        : judgement.continuum.columns
            .map((c) => c.label)
            .filter((l) => l.trim() !== "")
            .join(" · ");
    push({
      id: judgementBoxId,
      tier: "judgement",
      testId: "home-judgement",
      kindLabel: "Overall Judgement",
      label,
      refId: judgement.id,
    });
  }

  // 2) Superior meso layer (if grown) — sits above the subordinate one (Q33).
  const synLayer = synthesisLayer(doc);
  if (superior) {
    for (const node of [...superior.nodes].sort((a, b) => a.order - b.order)) {
      push({
        id: `sup-${node.id}`,
        tier: "superior",
        testId: `home-superior-node-${node.order}`,
        kindLabel: superior.kind === "criteria" ? "Criterion" : "Component",
        label: node.name,
        refId: node.id,
        // The superior layer is what feeds the judgement when it exists (Q4).
        parentBoxId: synLayer === superior ? judgementBoxId : undefined,
      });
    }
  }

  // 3) Subordinate meso layer — the evidence-bearing nodes (Q33).
  if (subordinate) {
    for (const node of [...subordinate.nodes].sort((a, b) => a.order - b.order)) {
      const parentBoxId = superior
        ? node.parentNodeId !== undefined
          ? `sup-${node.parentNodeId}`
          : undefined
        : synLayer === subordinate
          ? judgementBoxId
          : undefined;
      push({
        id: `sub-${node.id}`,
        tier: "subordinate",
        testId: `home-node-${node.order}`,
        kindLabel: subordinate.kind === "criteria" ? "Criterion" : "Component",
        label: node.name,
        refId: node.id,
        parentBoxId,
      });

      // 4) Evidence beneath each subordinate node (one box per link).
      for (const link of node.evidenceLinks) {
        const evId = `ev-${link.id}`;
        const method = methodById.get(link.evidenceMethodId);
        push({
          id: evId,
          tier: "evidence",
          testId: "home-evidence",
          kindLabel: "Evidence / Method",
          label: method?.name ?? "(unnamed)",
          refId: link.evidenceMethodId,
          nodeId: node.id,
          parentBoxId: `sub-${node.id}`,
        });

        // 5) Sub-methods beneath a combined mixed-methods source (the amendment
        //    tier — R-127). Shown for context; drill-in routes to the node.
        if (method?.isMixedMethodsSource) {
          for (const sub of method.memberSubMethods ?? []) {
            push({
              id: `sm-${evId}-${sub.id}`,
              tier: "submethod",
              testId: `home-submethod-${boxes.filter((b) => b.tier === "submethod").length}`,
              kindLabel: "Sub-method",
              label: methodById.get(sub.sourceMethodId)?.name ?? "(unnamed)",
              refId: sub.sourceMethodId,
              nodeId: node.id,
              parentBoxId: evId,
            });
          }
        }
      }
    }
  }

  layout(boxes);
  const boxIds = new Set(boxes.map((b) => b.id));
  const edges: MapEdge[] = boxes
    .filter((b) => b.parentBoxId !== undefined && boxIds.has(b.parentBoxId))
    .map((b) => ({ fromId: b.parentBoxId!, toId: b.id }));

  const width = boxes.reduce((w, b) => Math.max(w, b.x + b.width), 0) + MARGIN;
  const height = boxes.reduce((h, b) => Math.max(h, b.y + b.height), 0) + MARGIN;
  return { boxes, edges, width, height };
}

/**
 * Position the boxes: each abstraction level is a horizontal band (empty levels
 * are skipped so bands stay adjacent), and within a band boxes are placed
 * left→right in **DFS order** — so a parent's children are contiguous and land
 * roughly beneath it, keeping the connecting lines readable. Bands are centred
 * on the widest band. Mutates each box's `x`/`y`.
 */
function layout(boxes: MapBox[]): void {
  if (boxes.length === 0) return;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const childrenOf = new Map<string, MapBox[]>();
  const roots: MapBox[] = [];
  for (const b of boxes) {
    const parent = b.parentBoxId;
    if (parent !== undefined && byId.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(b);
      childrenOf.set(parent, list);
    } else {
      roots.push(b);
    }
  }
  roots.sort((a, b) => TIER_LEVEL[a.tier] - TIER_LEVEL[b.tier]);

  // DFS pre-order → per-tier ordered buckets (siblings grouped by ancestry).
  const buckets = new Map<MapTier, MapBox[]>();
  const visit = (box: MapBox) => {
    const bucket = buckets.get(box.tier) ?? [];
    bucket.push(box);
    buckets.set(box.tier, bucket);
    for (const child of childrenOf.get(box.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);

  const presentTiers = (Object.keys(TIER_LEVEL) as MapTier[])
    .filter((t) => (buckets.get(t)?.length ?? 0) > 0)
    .sort((a, b) => TIER_LEVEL[a] - TIER_LEVEL[b]);

  const rowWidth = (row: MapBox[]) =>
    row.reduce((sum, b) => sum + b.width, 0) + (row.length - 1) * H_GAP;
  const maxRowW = Math.max(...presentTiers.map((t) => rowWidth(buckets.get(t)!)));

  presentTiers.forEach((tier, band) => {
    const row = buckets.get(tier)!;
    let cursor = MARGIN + (maxRowW - rowWidth(row)) / 2;
    const y = MARGIN + band * (BOX_HEIGHT + V_GAP);
    for (const box of row) {
      box.x = cursor;
      box.y = y;
      cursor += box.width + H_GAP;
    }
  });
}
