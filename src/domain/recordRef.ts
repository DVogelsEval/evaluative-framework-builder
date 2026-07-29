import { findColumnInAnyLayer } from "./layers";
import type { Cell, EvaluationQuestion, MesoNode, RecordEntry } from "./schema";

/**
 * The `elementRef` format for `RecordEntry` (V2 record layer, docs/ROADMAP-V2.md
 * §1.2 — pinned here, never hand-typed at a call site):
 *
 *   eq | layer:<id> | layer:<id>/bar | layer:<id>/column:<id> | node:<id> |
 *   node:<id>/importance | node:<id>/cell:<id> | node:<id>/cell:<id>/condition |
 *   judgement | judgement/column:<id> | simCase:<id>
 *
 * `simCase:<id>` (V2 Phase 2.4) is the anchor a promoted reviewer critique's
 * RecordEntry names — added alongside the rest, not a separate scheme.
 *
 * Builders are the only place a ref string is assembled; `parseRef` is the only
 * place one is taken apart; `labelForRef` resolves a ref against the CURRENT
 * document so a rename doesn't orphan history (the same principle as Scenario
 * tokens, Q41/Q43) and degrades gracefully once the element has been deleted.
 */

export type RecordRef =
  | { kind: "eq" }
  | { kind: "layer"; layerId: string }
  | { kind: "bar"; layerId: string }
  | { kind: "column"; layerId: string; columnId: string }
  | { kind: "node"; nodeId: string }
  | { kind: "importance"; nodeId: string }
  | { kind: "cell"; nodeId: string; cellId: string }
  | { kind: "condition"; nodeId: string; cellId: string }
  | { kind: "judgement" }
  | { kind: "judgementColumn"; columnId: string }
  | { kind: "simCase"; simCaseId: string };

// ---- Builders -----------------------------------------------------------------

export const refForEq = (): string => "eq";
export const refForLayer = (layerId: string): string => `layer:${layerId}`;
export const refForBar = (layerId: string): string => `layer:${layerId}/bar`;
export const refForColumn = (layerId: string, columnId: string): string =>
  `layer:${layerId}/column:${columnId}`;
export const refForNode = (nodeId: string): string => `node:${nodeId}`;
export const refForImportance = (nodeId: string): string => `node:${nodeId}/importance`;
export const refForCell = (nodeId: string, cellId: string): string =>
  `node:${nodeId}/cell:${cellId}`;
export const refForCondition = (nodeId: string, cellId: string): string =>
  `node:${nodeId}/cell:${cellId}/condition`;
export const refForJudgement = (): string => "judgement";
export const refForJudgementColumn = (columnId: string): string => `judgement/column:${columnId}`;
export const refForSimCase = (simCaseId: string): string => `simCase:${simCaseId}`;

// ---- Parser ---------------------------------------------------------------

/** Parses an `elementRef` string; `null` for anything malformed. */
export function parseRef(ref: string): RecordRef | null {
  const [head, ...rest] = ref.split("/");

  if (head === "eq" && rest.length === 0) return { kind: "eq" };

  if (head === "judgement") {
    if (rest.length === 0) return { kind: "judgement" };
    const column = rest.length === 1 ? rest[0]!.match(/^column:(.+)$/) : null;
    return column ? { kind: "judgementColumn", columnId: column[1]! } : null;
  }

  const layerMatch = head?.match(/^layer:(.+)$/);
  if (layerMatch) {
    const layerId = layerMatch[1]!;
    if (rest.length === 0) return { kind: "layer", layerId };
    if (rest.length === 1 && rest[0] === "bar") return { kind: "bar", layerId };
    const column = rest.length === 1 ? rest[0]!.match(/^column:(.+)$/) : null;
    return column ? { kind: "column", layerId, columnId: column[1]! } : null;
  }

  const nodeMatch = head?.match(/^node:(.+)$/);
  if (nodeMatch) {
    const nodeId = nodeMatch[1]!;
    if (rest.length === 0) return { kind: "node", nodeId };
    if (rest.length === 1 && rest[0] === "importance") return { kind: "importance", nodeId };
    const cellMatch = rest[0]?.match(/^cell:(.+)$/);
    if (cellMatch) {
      const cellId = cellMatch[1]!;
      if (rest.length === 1) return { kind: "cell", nodeId, cellId };
      if (rest.length === 2 && rest[1] === "condition") return { kind: "condition", nodeId, cellId };
    }
    return null;
  }

  const simCaseMatch = head?.match(/^simCase:(.+)$/);
  if (simCaseMatch && rest.length === 0) return { kind: "simCase", simCaseId: simCaseMatch[1]! };

  return null;
}

// ---- Live resolution --------------------------------------------------------

function findNode(doc: EvaluationQuestion, nodeId: string): MesoNode | undefined {
  for (const layer of doc.mesoLayers) {
    const node = layer.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  return undefined;
}

function findNodeAndCell(
  doc: EvaluationQuestion,
  nodeId: string,
  cellId: string,
): { node: MesoNode; cell: Cell } | undefined {
  const node = findNode(doc, nodeId);
  const cell = node?.cells.find((c) => c.id === cellId);
  return node && cell ? { node, cell } : undefined;
}

/**
 * A human-readable label for a ref, resolved against the CURRENT document —
 * never cached, never stored. Degrades to a "(deleted …)" placeholder once the
 * element it names no longer exists, rather than throwing: history must stay
 * readable after the thing it concerns is gone.
 */
export function labelForRef(doc: EvaluationQuestion, ref: string): string {
  const parsed = parseRef(ref);
  if (!parsed) return "(unresolvable reference)";

  switch (parsed.kind) {
    case "eq":
      return doc.title || "(the Evaluation Question)";

    case "layer": {
      const layer = doc.mesoLayers.find((l) => l.id === parsed.layerId);
      if (!layer) return "(deleted layer)";
      return layer.kind === "criteria" ? "Criteria layer" : "Components layer";
    }

    case "bar": {
      const layer = doc.mesoLayers.find((l) => l.id === parsed.layerId);
      return layer ? "Sufficient Bar" : "(deleted layer's Sufficient Bar)";
    }

    case "column": {
      const column = findColumnInAnyLayer(doc, parsed.columnId);
      return column ? `Column Header "${column.label || "(unnamed)"}"` : "(deleted column)";
    }

    case "node": {
      const node = findNode(doc, parsed.nodeId);
      return node ? node.name || "(unnamed)" : "(deleted node)";
    }

    case "importance": {
      const node = findNode(doc, parsed.nodeId);
      return node ? `${node.name || "(unnamed)"} — importance/reach` : "(deleted node's importance)";
    }

    case "cell": {
      const found = findNodeAndCell(doc, parsed.nodeId, parsed.cellId);
      if (!found) return "(deleted cell)";
      const column = findColumnInAnyLayer(doc, found.cell.columnId);
      return `${found.node.name || "(unnamed)"} — ${column?.label || "(column)"}`;
    }

    case "condition": {
      const found = findNodeAndCell(doc, parsed.nodeId, parsed.cellId);
      if (!found) return "(deleted cell's condition)";
      const column = findColumnInAnyLayer(doc, found.cell.columnId);
      return `${found.node.name || "(unnamed)"} — ${column?.label || "(column)"} condition`;
    }

    case "judgement":
      return "Overall Judgement";

    case "judgementColumn": {
      const column = doc.overallJudgement?.continuum.columns.find(
        (c) => c.id === parsed.columnId,
      );
      return column
        ? `Overall Judgement — "${column.label || "(unnamed)"}"`
        : "(deleted judgement column)";
    }

    case "simCase": {
      const simCase = doc.simCases.find((c) => c.id === parsed.simCaseId);
      return simCase ? `Case "${simCase.label || "(unnamed case)"}"` : "(deleted case)";
    }
  }
}

/**
 * Every RecordEntry naming this exact ref, newest first — the "element
 * history" strip (docs/ROADMAP-V2.md §1.5). Includes withheld entries: that
 * flag only scopes EXPORTS (Phase 1.4), never the author's own view of their
 * own history.
 */
export function entriesForRef(doc: EvaluationQuestion, ref: string): RecordEntry[] {
  return doc.records
    .filter((r) => r.elementRef === ref)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}

/**
 * Every RecordEntry naming this node OR one of its descendants — its
 * importance/reach mark, any of its cells, or any of those cells' conditions
 * (docs/ROADMAP-V2.md §3.1, the criterion timeline). Resolved by `parseRef`,
 * not string matching, so it doesn't care how the ref was spelled. Newest
 * first, same ordering as `entriesForRef`.
 */
export function entriesForNodeAndDescendants(
  doc: EvaluationQuestion,
  nodeId: string,
): RecordEntry[] {
  return doc.records
    .filter((r) => {
      const parsed = parseRef(r.elementRef);
      if (!parsed) return false;
      switch (parsed.kind) {
        case "node":
        case "importance":
        case "cell":
        case "condition":
          return parsed.nodeId === nodeId;
        default:
          return false;
      }
    })
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}
