import { PATTERN_COMPARATORS, STRENGTH_VALUES } from "./conditionLexicon";
import { subordinateLayer, superiorLayer, synthesisLayer } from "./layers";
import type {
  BooleanConditionNode,
  ComparisonValue,
  ConditionTerm,
  EvaluationQuestion,
  MesoLayer,
  MesoNode,
  RubricCellCondition,
} from "./schema";

/**
 * The Simulate Judgement evaluator (Slice 14, owner Q60/Q61). **This is the one
 * and only module in the app permitted to *execute* a Boolean condition.** It
 * takes throwaway, hypothetical evidence values and folds them upward through
 * the Slice-13 conditions to preview how the framework would resolve —
 * evidence → criterion conclusion → (superior conclusion) → Overall Judgement.
 *
 * Everything here is ephemeral: it reads the document but writes nothing, and it
 * must never be imported by `store.ts`, `autosave.ts`, or any `output*.ts`/
 * `to*.ts` export serialiser (enforced by `simulateBoundary.test.ts`). The
 * Slice-13 non-goal — "conditions are documentation, never run" — continues to
 * hold everywhere except this sandbox.
 *
 * Truth is three-valued (Kleene): an unset input makes a term **unknown**, and
 * unknown propagates (R-SIM-4) so the simulation never silently invents a
 * rating for a value the user hasn't entered.
 */

export type Truth = "true" | "false" | "unknown";

/** A resolved test input for one condition term. `undefined` (absent key) is
 *  "unknown". A conclusion input carries its layer's column order so the ordinal
 *  comparators (`is at or above`, …) resolve without extra context. */
export type SimInput =
  | { kind: "strength"; rating: (typeof STRENGTH_VALUES)[number] }
  | { kind: "number"; n: number }
  | { kind: "boolean"; b: boolean }
  | { kind: "conclusion"; columnId: string; order: string[] };

/** The user's raw session inputs, keyed `${nodeId}::${termSlot}` — see
 *  `termSlotKey`. Stored as plain `ComparisonValue`s (a strength rating, a
 *  number, or a boolean) so the input UI needs no knowledge of `SimInput`. */
export type SessionInputs = Record<string, ComparisonValue | undefined>;

export interface NodeConclusionResult {
  status: "resolved" | "no_match" | "ambiguous" | "unknown" | "no_conditions";
  /** The resolved column (when `resolved`). */
  columnId?: string;
  /** The columns whose conditions fired (>1 only when `ambiguous`) — R-SIM-5. */
  satisfiedColumnIds?: string[];
  /** The fired condition, for the read-only "which condition fired" display. */
  firedCondition?: RubricCellCondition;
  /** Element labels with no test value, for "Cannot determine (missing: …)". */
  missingElementLabels?: string[];
}

export interface SimulateResult {
  /** Every meso node's resulting conclusion, keyed by node id. */
  byNode: Record<string, NodeConclusionResult>;
  /** The simulated Overall Judgement, when a synthesis exists. */
  overall?: NodeConclusionResult;
}

// ---- Term evaluation ---------------------------------------------------------

const strengthRank = (v: string): number =>
  STRENGTH_VALUES.length - 1 - STRENGTH_VALUES.indexOf(v as (typeof STRENGTH_VALUES)[number]);

const EXISTENCE = new Set(["exists", "does_not_exist"]);

/**
 * The session-input slot a term reads. Pattern queries are per (element, flag) —
 * a method may be asked about strength *and* whether it shows a contradiction,
 * so those never share a slot. Everything else reads the element's own slot.
 */
export function termSlotKey(term: ConditionTerm): string {
  if (PATTERN_COMPARATORS.includes(term.comparator)) {
    return `${term.evidenceElementId}::pattern::${String(term.value)}`;
  }
  return term.evidenceElementId;
}

/** Evaluate one term against its resolved input (or `undefined` = unknown). */
function evaluateTerm(term: ConditionTerm, input: SimInput | undefined): Truth {
  if (input === undefined) return "unknown";
  const { comparator, value } = term;

  if (EXISTENCE.has(comparator)) {
    if (input.kind !== "boolean") return "unknown";
    return (comparator === "exists" ? input.b : !input.b) ? "true" : "false";
  }
  if (PATTERN_COMPARATORS.includes(comparator)) {
    if (input.kind !== "boolean") return "unknown";
    const shown = comparator === "shows" || comparator === "contains";
    return (shown ? input.b : !input.b) ? "true" : "false";
  }

  // Ordinal / numeric comparators.
  if (input.kind === "number" && typeof value === "number") {
    return numericCompare(comparator, input.n, value) ? "true" : "false";
  }
  if (input.kind === "strength" && typeof value === "string") {
    return ordinalCompare(comparator, strengthRank(input.rating), strengthRank(value))
      ? "true"
      : "false";
  }
  if (input.kind === "conclusion" && value !== null && typeof value === "object") {
    const testIdx = input.order.indexOf(input.columnId);
    const targetIdx = input.order.indexOf(value.columnId);
    if (testIdx < 0 || targetIdx < 0) return "unknown";
    return ordinalCompare(comparator, testIdx, targetIdx) ? "true" : "false";
  }
  // Input kind and term value disagree (e.g. a strength term with a number set) —
  // can't be determined rather than silently false.
  return "unknown";
}

function ordinalCompare(comparator: string, a: number, b: number): boolean {
  switch (comparator) {
    case "is":
      return a === b;
    case "is_not":
      return a !== b;
    case "is_at_or_above":
      return a >= b;
    case "is_above":
      return a > b;
    case "is_below":
      return a < b;
    default:
      return false;
  }
}

function numericCompare(comparator: string, a: number, b: number): boolean {
  switch (comparator) {
    case "is_exactly":
      return a === b;
    case "is_at_least":
      return a >= b;
    case "is_more_than":
      return a > b;
    case "is_fewer_than":
      return a < b;
    case "is_at_most":
      return a <= b;
    // Clarity also offers is_above / is_below over its 1–5 scale.
    case "is_above":
      return a > b;
    case "is_below":
      return a < b;
    default:
      return false;
  }
}

/**
 * Evaluate a Boolean AST to three-valued truth (R-SIM-4). AND is false if any
 * operand is false, else unknown if any is unknown, else true; OR is the dual;
 * NOT flips true/false and leaves unknown unknown.
 */
export function evaluateCondition(
  node: BooleanConditionNode,
  testValues: Record<string, SimInput | undefined>,
): Truth {
  switch (node.type) {
    case "TERM":
      return evaluateTerm(node.term, testValues[termSlotKey(node.term)]);
    case "NOT": {
      const inner = evaluateCondition(node.operand, testValues);
      return inner === "true" ? "false" : inner === "false" ? "true" : "unknown";
    }
    case "AND": {
      let sawUnknown = false;
      for (const op of node.operands) {
        const t = evaluateCondition(op, testValues);
        if (t === "false") return "false";
        if (t === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "true";
    }
    case "OR": {
      let sawUnknown = false;
      for (const op of node.operands) {
        const t = evaluateCondition(op, testValues);
        if (t === "true") return "true";
        if (t === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "false";
    }
  }
}

// ---- Folding one node --------------------------------------------------------

/** A column with a Boolean condition to evaluate (a rubric cell, or a synthesis
 *  column). Prose-mode / condition-less cells are excluded by the caller. */
interface ConditionedColumn {
  columnId: string;
  condition: RubricCellCondition;
}

/** Every term reachable in an AST (for the missing-element report). */
function collectTerms(node: BooleanConditionNode, out: ConditionTerm[]): void {
  switch (node.type) {
    case "TERM":
      out.push(node.term);
      break;
    case "NOT":
      collectTerms(node.operand, out);
      break;
    case "AND":
    case "OR":
      node.operands.forEach((op) => collectTerms(op, out));
      break;
  }
}

/**
 * Fold a set of conditioned columns to one resulting conclusion under the given
 * test values. Exactly one satisfied → resolved; more than one → ambiguous
 * (surfaced, never auto-picked — R-SIM-5); none satisfied but some
 * undeterminable → unknown with the missing elements named (R-SIM-4); none at
 * all → no_match; no Boolean conditions present → no_conditions (authored as
 * prose — nothing to simulate).
 */
function foldColumns(
  columns: ConditionedColumn[],
  testValues: Record<string, SimInput | undefined>,
): NodeConclusionResult {
  if (columns.length === 0) return { status: "no_conditions" };

  const satisfied: ConditionedColumn[] = [];
  let sawUnknown = false;
  const missing = new Set<string>();

  for (const col of columns) {
    const root = col.condition.booleanLogic?.root;
    if (!root) continue;
    const truth = evaluateCondition(root, testValues);
    if (truth === "true") satisfied.push(col);
    else if (truth === "unknown") {
      sawUnknown = true;
      const terms: ConditionTerm[] = [];
      collectTerms(root, terms);
      for (const term of terms) {
        if (testValues[termSlotKey(term)] === undefined) missing.add(term.evidenceElementLabel);
      }
    }
  }

  if (satisfied.length > 1) {
    return {
      status: "ambiguous",
      satisfiedColumnIds: satisfied.map((c) => c.columnId),
    };
  }
  if (satisfied.length === 1) {
    return {
      status: "resolved",
      columnId: satisfied[0]!.columnId,
      firedCondition: satisfied[0]!.condition,
    };
  }
  if (sawUnknown) {
    return { status: "unknown", missingElementLabels: [...missing] };
  }
  return { status: "no_match" };
}

/** The open, Boolean-conditioned cells of a meso node (R-SIM-3 step 1). */
function conditionedCellsOf(node: MesoNode): ConditionedColumn[] {
  return node.cells
    .filter((c) => c.included && c.condition?.mode === "boolean" && c.condition.booleanLogic)
    .map((c) => ({ columnId: c.columnId, condition: c.condition! }));
}

/**
 * The resulting conclusion for a single meso node under test values scoped to
 * that node (R-SIM-3 step 1). Exposed for unit tests; `foldFramework` wires the
 * per-node scoping and the layer-to-layer feed.
 */
export function foldNodeConclusion(
  node: MesoNode,
  testValues: Record<string, SimInput | undefined>,
): NodeConclusionResult {
  return foldColumns(conditionedCellsOf(node), testValues);
}

// ---- Folding the whole framework --------------------------------------------

/** Convert a raw session input to a resolved `SimInput` (or undefined). */
function toSimInput(raw: ComparisonValue | undefined): SimInput | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") return { kind: "number", n: raw };
  if (typeof raw === "boolean") return { kind: "boolean", b: raw };
  if (typeof raw === "string" && (STRENGTH_VALUES as readonly string[]).includes(raw)) {
    return { kind: "strength", rating: raw as (typeof STRENGTH_VALUES)[number] };
  }
  return undefined;
}

/** Build the per-node test map for an evidence-bearing (subordinate) node from
 *  the user's raw session inputs, keyed by that node's term slots. */
function subordinateTestValues(
  node: MesoNode,
  inputs: SessionInputs,
): Record<string, SimInput | undefined> {
  const map: Record<string, SimInput | undefined> = {};
  for (const cell of node.cells) {
    const root = cell.condition?.booleanLogic?.root;
    if (!root) continue;
    const terms: ConditionTerm[] = [];
    collectTerms(root, terms);
    for (const term of terms) {
      const slot = termSlotKey(term);
      map[slot] = toSimInput(inputs[`${node.id}::${slot}`]);
    }
  }
  return map;
}

/** Build the test map for a node/synthesis one layer up: each referenced lower
 *  node's slot (keyed by that node's id) resolves to its computed conclusion. */
function conclusionTestValues(
  lowerLayer: MesoLayer,
  byNode: Record<string, NodeConclusionResult>,
): Record<string, SimInput | undefined> {
  const order = lowerLayer.continuum.columns.map((c) => c.id);
  const map: Record<string, SimInput | undefined> = {};
  for (const node of lowerLayer.nodes) {
    const result = byNode[node.id];
    map[node.id] =
      result?.status === "resolved" && result.columnId
        ? { kind: "conclusion", columnId: result.columnId, order }
        : undefined; // no_match / ambiguous / unknown all propagate as unknown
  }
  return map;
}

/**
 * Fold the whole framework (R-SIM-3). Evidence values resolve each subordinate
 * node's conclusion; those feed a superior layer if present; the top meso
 * layer's conclusions feed the Overall Judgement's Boolean conditions to yield
 * the simulated Overall Judgement. Layers or a synthesis left in prose (no
 * Boolean conditions) come back as `no_conditions` — shown read-only, never
 * fabricated.
 */
export function foldFramework(
  doc: EvaluationQuestion,
  inputs: SessionInputs,
): SimulateResult {
  const byNode: Record<string, NodeConclusionResult> = {};
  const subordinate = subordinateLayer(doc);
  const superior = superiorLayer(doc);

  // 1) Subordinate (evidence-bearing) nodes — from the user's evidence values.
  if (subordinate) {
    for (const node of subordinate.nodes) {
      byNode[node.id] = foldNodeConclusion(node, subordinateTestValues(node, inputs));
    }
  }

  // 2) Superior layer (if grown) — from the subordinate conclusions.
  if (superior && subordinate) {
    const testValues = conclusionTestValues(subordinate, byNode);
    for (const node of superior.nodes) {
      byNode[node.id] = foldColumns(conditionedCellsOf(node), testValues);
    }
  }

  // 3) Overall Judgement — from the synthesis layer's conclusions (Q4/Q61).
  const result: SimulateResult = { byNode };
  const judgement = doc.overallJudgement;
  const feedLayer = synthesisLayer(doc);
  if (judgement && feedLayer) {
    const columns: ConditionedColumn[] = (judgement.conditionCells ?? [])
      .filter((c) => c.condition.mode === "boolean" && c.condition.booleanLogic)
      .map((c) => ({ columnId: c.columnId, condition: c.condition }));
    result.overall = foldColumns(columns, conclusionTestValues(feedLayer, byNode));
  }

  return result;
}
