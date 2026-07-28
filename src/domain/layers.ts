import type { Column, EvaluationQuestion, MesoLayer, MesoNode } from "./schema";

/**
 * Meso-layer roles (Slice 7, Q3/Q4/Q33). The meso tier is one or two layers,
 * each a full rubric of its own. Which layer plays which role is a stored
 * `tierOrder`, never a fixed Criteria/Components rule:
 *
 *  - `tierOrder === 0` is the **subordinate** layer — it always owns the
 *    evidence tier (Q33) and is what Slices 0–6 build. Always present.
 *  - `tierOrder === 1` is the optional **superior** layer sitting above it; when
 *    present it is what the Overall Judgement synthesises (Q4).
 *
 * These pure selectors are the single place that resolves "which layer" for a
 * given job, so every call site states its intent instead of hard-coding
 * `tierOrder === 0`.
 */

/** The subordinate layer (tierOrder 0) — owns the evidence tier (Q33). */
export function subordinateLayer(doc: EvaluationQuestion): MesoLayer | undefined {
  return doc.mesoLayers.find((l) => l.tierOrder === 0);
}

/** The superior layer (tierOrder 1) if a second layer exists (Q33). */
export function superiorLayer(doc: EvaluationQuestion): MesoLayer | undefined {
  return doc.mesoLayers.find((l) => l.tierOrder === 1);
}

/** Where evidence attaches: always the subordinate layer (Q33). */
export const evidenceLayer = subordinateLayer;

/**
 * The layer the Overall Judgement synthesises (Q4): the superior layer if one
 * exists, otherwise the subordinate layer. A single-layer framework synthesises
 * its only layer; growing a second (superior) layer moves synthesis up to it.
 */
export function synthesisLayer(doc: EvaluationQuestion): MesoLayer | undefined {
  return superiorLayer(doc) ?? subordinateLayer(doc);
}

/** Whether a second (superior) meso layer exists (R-045). */
export function hasSecondLayer(doc: EvaluationQuestion): boolean {
  return superiorLayer(doc) !== undefined;
}

/**
 * Resolve a column id to its Column by searching **every** meso layer's
 * continuum (Q53 reading point 2). A synthesis-scenario token, or a superior
 * node's inter-layer conditional-statement token (Q54), carries an `atColumnId`
 * that may name a column owned by *either* layer now that both layers feed the
 * judgement — so column labels must be resolved against the owning layer, not
 * `synthesisLayer()`'s single continuum.
 */
export function findColumnInAnyLayer(
  doc: EvaluationQuestion,
  columnId: string,
): Column | undefined {
  for (const layer of doc.mesoLayers) {
    const column = layer.continuum.columns.find((c) => c.id === columnId);
    if (column) return column;
  }
  return undefined;
}

/**
 * The superior layer's completion predicate (the Q20 "done-or-declined" term
 * for the optional second-layer stage — declining is removing it). Provisional
 * v1 gate (⚠Q49): ≥1 superior node, every superior node named, every superior
 * Column Header filled, and every subordinate node rolled up into an existing
 * superior node via `parentNodeId` (R-046). The superior layer carries no
 * evidence and no plain-description gate in v1 (⚠Q49).
 */
export function secondLayerComplete(doc: EvaluationQuestion): boolean {
  const superior = superiorLayer(doc);
  const subordinate = subordinateLayer(doc);
  if (!superior || !subordinate) return true; // no second layer ⇒ nothing to complete
  if (superior.nodes.length === 0) return false;
  if (superior.nodes.some((n) => n.name.trim() === "")) return false;
  if (superior.continuum.columns.some((c) => c.label.trim() === "")) return false;
  const superiorIds = new Set(superior.nodes.map((n) => n.id));
  return subordinate.nodes.every(
    (n) => n.parentNodeId !== undefined && superiorIds.has(n.parentNodeId),
  );
}

/** Subordinate nodes rolled up into a given superior node (R-046, R-123). */
export function childrenOf(
  doc: EvaluationQuestion,
  superiorNodeId: string,
): MesoNode[] {
  const subordinate = subordinateLayer(doc);
  return (subordinate?.nodes ?? []).filter((n) => n.parentNodeId === superiorNodeId);
}

/**
 * Output-B ordering hook (R-123, Q15): components before criteria. Wired now
 * even though Output B itself is Slice 8 — outputs walk the layers in this
 * order regardless of which is subordinate/superior, so a components layer
 * always prints above a criteria layer.
 */
export function orderedLayersForOutput(doc: EvaluationQuestion): MesoLayer[] {
  const rank = (layer: MesoLayer): number => (layer.kind === "components" ? 0 : 1);
  return [...doc.mesoLayers].sort((a, b) => rank(a) - rank(b));
}
