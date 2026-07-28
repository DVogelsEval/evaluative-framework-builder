import { subordinateLayer, superiorLayer, synthesisLayer } from "./layers";
import type {
  Comparator,
  ComparisonValue,
  EvaluationQuestion,
  MesoLayer,
  MesoNode,
} from "./schema";

/**
 * The condition lexicon (Slice 13) — the lookup tables behind the click-based
 * builder and the parser, transcribed from `docs/CONDITION-LEXICON.md`. Three
 * pure functions drive the context-aware modal (R-COND-3/4): which evidence
 * elements a node offers, which comparators an element takes, and which values
 * a comparator/element pair accepts. Nothing here executes a condition.
 */

// ---- Comparators (CONDITION-LEXICON §C/§G) ----------------------------------

/** Canonical plain-English phrase for each comparator — a 1:1 map, so
 *  rendering never needs the element's type (that is why the 16 comparators are
 *  distinct enum members rather than collapsed to symbols). */
export const COMPARATOR_PHRASE: Record<Comparator, string> = {
  is: "is",
  is_not: "is not",
  is_at_or_above: "is at or above",
  is_above: "is above",
  is_below: "is below",
  is_exactly: "is exactly",
  is_at_least: "is at least",
  is_more_than: "is more than",
  is_fewer_than: "is fewer than",
  is_at_most: "is at most",
  exists: "exists",
  does_not_exist: "does not exist",
  shows: "shows",
  does_not_show: "does not show",
  contains: "contains",
  does_not_contain: "does not contain",
};

const EXISTENCE_COMPARATORS: Comparator[] = ["exists", "does_not_exist"];
export const PATTERN_COMPARATORS: Comparator[] = [
  "shows",
  "does_not_show",
  "contains",
  "does_not_contain",
];

/** Existence comparators (`exists` / `does not exist`) take no value (§C.2). */
export function comparatorTakesValue(comparator: Comparator): boolean {
  return !EXISTENCE_COMPARATORS.includes(comparator);
}

// ---- Value vocabularies (CONDITION-LEXICON §D) ------------------------------

export const STRENGTH_VALUES = ["Strong", "Good", "Developing", "Not Yet"] as const;
export const PATTERN_VALUES = [
  "contradiction",
  "regression",
  "inconsistency",
  "gap",
  "framework_drift",
] as const;
export const TIER_TYPE_VALUES = ["Rubric", "DataDescriptionList", "Mixed-Method"] as const;

// ---- Evidence elements (CONDITION-LEXICON §B) --------------------------------

/** A comparator class scopes which comparators an element offers (R-COND-4). An
 *  element may belong to several — a method is strength-rated *and* pattern-
 *  checkable (`[Method C] shows contradiction`). */
export type ElementClass =
  | "strength"
  | "count"
  | "clarity"
  | "existence"
  | "pattern"
  | "conclusion";

/** A referenceable rubric column (a conclusion element's value options). */
export interface ColumnChoice {
  columnId: string;
  label: string;
}

export interface EvidenceElement {
  id: string; // stable: a method UUID, a fixed slug ("scenarioClarity"), or a node UUID
  label: string; // bracketed display, e.g. "[Method A]"
  classes: ElementClass[];
  // Only for `conclusion` elements (§B.7): the columns of the layer this node
  // belongs to, in left→right order — the values its condition can compare
  // against, and the total order the ordinal comparators use.
  columns?: ColumnChoice[];
}

const COMPARATORS_BY_CLASS: Record<ElementClass, Comparator[]> = {
  // §C.1 — strength / rating
  strength: ["is", "is_not", "is_at_or_above", "is_above", "is_below"],
  // §C.4 — counts
  count: ["is_exactly", "is_at_least", "is_more_than", "is_fewer_than", "is_at_most"],
  // §C.4 — clarity (numeric 1–5): the R-COND-4 subset
  clarity: ["is_exactly", "is_at_least", "is_above", "is_below"],
  // §C.2 — existence
  existence: EXISTENCE_COMPARATORS,
  // §C.3 — pattern / flag
  pattern: PATTERN_COMPARATORS,
  // §B.7 — a lower node's resulting conclusion: ordinal over that layer's
  // columns (left→right = Not-Yet→Strong sense), same shape as strength.
  conclusion: ["is", "is_not", "is_at_or_above", "is_above", "is_below"],
};

/**
 * The evidence elements referenceable when authoring a condition on `node`
 * (R-COND-3). Scoped to the current node and layer — no cross-node references
 * in Slice 13. Method labels resolve live from the pool so a rename flows
 * through. Second-layer and synthesis elements appear only when those exist.
 */
export function evidenceElementsForNode(
  node: MesoNode,
  doc: EvaluationQuestion,
): EvidenceElement[] {
  // A superior-layer node has no evidence of its own (Q33); its condition rolls
  // up the subordinate layer, so it references those nodes' conclusions (§B.7).
  const superior = superiorLayer(doc);
  if (superior && superior.nodes.some((n) => n.id === node.id)) {
    const subordinate = subordinateLayer(doc);
    return subordinate ? conclusionElementsForLayer(subordinate) : [];
  }

  const elements: EvidenceElement[] = [];

  // §B.1 — the node's linked Evidence/Methods (strength-rated + pattern-checkable)
  for (const link of node.evidenceLinks) {
    const method = doc.evidenceMethods.find((m) => m.id === link.evidenceMethodId);
    if (!method) continue;
    elements.push({
      id: method.id,
      label: `[${method.name || "(unnamed method)"}]`,
      classes: ["strength", "pattern"],
    });
  }

  // §B.2 — evidence tiers (existence)
  elements.push(
    { id: "evidenceRubricTier", label: "[Evidence Rubric Tier]", classes: ["existence"] },
    {
      id: "evidenceDataDescriptionTier",
      label: "[Evidence Data Description Tier]",
      classes: ["existence"],
    },
    {
      id: "evidenceMixedMethodTier",
      label: "[Evidence Mixed-Method Tier]",
      classes: ["existence"],
    },
  );

  // §B.3 — scenario clarity (numeric 1–5)
  elements.push({
    id: "scenarioClarity",
    label: "[Scenario Clarity]",
    classes: ["clarity"],
  });

  // §B.4 — counts / aggregates
  elements.push(
    { id: "evidenceMethodCount", label: "[Evidence Method Count]", classes: ["count"] },
    { id: "evidenceTierCount", label: "[Evidence Tier Count]", classes: ["count"] },
    { id: "strongEvidenceCount", label: "[Strong Evidence Count]", classes: ["count"] },
    { id: "goodEvidenceCount", label: "[Good Evidence Count]", classes: ["count"] },
  );

  // §B.5 — second-layer presence (only when a second meso layer exists)
  if (doc.mesoLayers.length >= 2) {
    elements.push(
      { id: "superiorLayerNode", label: "[Superior Layer Node]", classes: ["existence"] },
      {
        id: "subordinateNodeExists",
        label: "[Subordinate Node Exists]",
        classes: ["existence"],
      },
    );
  }

  // §B.6 — synthesis connection (only when an Overall Judgement exists)
  if (doc.overallJudgement) {
    elements.push(
      {
        id: "synthesisScenariosExist",
        label: "[Synthesis Scenarios Exist]",
        classes: ["existence"],
      },
      { id: "synthesisClarity", label: "[Synthesis Clarity]", classes: ["clarity"] },
    );
  }

  return elements;
}

/** Whether a node offers any boolean elements at all — drives the mode default
 *  (Boolean if it does, else Prose) and the R-COND-7 "requires evidence" gate. */
export function hasBooleanElements(node: MesoNode, doc?: EvaluationQuestion): boolean {
  // A superior-layer node reasons about the subordinate layer's conclusions, so
  // Boolean mode is meaningful when that layer has nodes to roll up.
  if (doc) {
    const superior = superiorLayer(doc);
    if (superior && superior.nodes.some((n) => n.id === node.id)) {
      return (subordinateLayer(doc)?.nodes.length ?? 0) > 0;
    }
  }
  // Otherwise (a subordinate node): Boolean mode is only *meaningful* when the
  // node has evidence methods to reason about.
  return node.evidenceLinks.length > 0;
}

/**
 * The comparators an element offers, in lexicon order, de-duplicated across its
 * classes (R-COND-4). A method (strength + pattern) offers both sets.
 */
export function comparatorsForElement(element: EvidenceElement): Comparator[] {
  const seen = new Set<Comparator>();
  const out: Comparator[] = [];
  for (const cls of element.classes) {
    for (const comparator of COMPARATORS_BY_CLASS[cls]) {
      if (!seen.has(comparator)) {
        seen.add(comparator);
        out.push(comparator);
      }
    }
  }
  return out;
}

/** How the value picker should behave for a given element + comparator. */
export type ValueChoices =
  | { kind: "none" } // existence comparators
  | { kind: "strength"; options: readonly string[] }
  | { kind: "pattern"; options: readonly string[] }
  | { kind: "number"; min: number; max?: number }
  | { kind: "columns"; options: ColumnChoice[] }; // conclusion refs (§B.7)

/**
 * The values a comparator accepts for a given element (R-COND-4). Existence
 * comparators take none; pattern comparators take the named flags; otherwise
 * the element's primary class decides (strength ratings, clarity 1–5, or an
 * open count ≥ 0).
 */
export function valuesForTerm(
  element: EvidenceElement,
  comparator: Comparator,
): ValueChoices {
  if (EXISTENCE_COMPARATORS.includes(comparator)) return { kind: "none" };
  if (PATTERN_COMPARATORS.includes(comparator)) {
    return { kind: "pattern", options: PATTERN_VALUES };
  }
  if (element.classes.includes("conclusion")) {
    return { kind: "columns", options: element.columns ?? [] };
  }
  if (element.classes.includes("clarity")) return { kind: "number", min: 1, max: 5 };
  if (element.classes.includes("count")) return { kind: "number", min: 0 };
  return { kind: "strength", options: STRENGTH_VALUES };
}

/** Display string for a value in a term ("Good", "3", or "" for no value). A
 *  conclusion target is a `{ columnId }`; its human label is resolved by the
 *  caller (the modal, from the element's columns) and stored as `valueLabel`. */
export function valueLabel(value: ComparisonValue): string {
  if (value === null) return "";
  if (typeof value === "object") return ""; // {columnId} — labelled by the caller
  return String(value);
}

// ---- Conclusion elements (CONDITION-LEXICON §B.7, Slice-14 authoring) --------

/**
 * The conclusion-reference elements for a layer: one per node, comparing that
 * node's resolved column against the layer's shared columns (Q30). Offered when
 * authoring a condition one layer *up* — a superior-layer node's condition over
 * its subordinate nodes, or the Overall Judgement's condition over the top meso
 * layer. This is the one cross-node reference the app supports, and it is only
 * ever *executed* inside the ephemeral simulate sandbox (§B.7 / owner Q60/Q61).
 */
export function conclusionElementsForLayer(layer: MesoLayer): EvidenceElement[] {
  const columns: ColumnChoice[] = layer.continuum.columns.map((c) => ({
    columnId: c.id,
    label: c.label || "(unnamed)",
  }));
  return [...layer.nodes]
    .sort((a, b) => a.order - b.order)
    .map((node) => ({
      id: node.id,
      label: `[${node.name || "(unnamed)"}]`,
      classes: ["conclusion"] as ElementClass[],
      columns,
    }));
}

/**
 * The elements the Overall Judgement's Boolean conditions may reference (Q61):
 * the conclusions of the layer synthesis feeds from — the superior layer if one
 * exists, else the subordinate layer (`synthesisLayer`, Q4).
 */
export function judgementConclusionElements(
  doc: EvaluationQuestion,
): EvidenceElement[] {
  const layer = synthesisLayer(doc);
  return layer ? conclusionElementsForLayer(layer) : [];
}
