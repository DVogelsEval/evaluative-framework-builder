import { describe, expect, it } from "vitest";
import { toPlainEnglish } from "./BooleanParser";
import {
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createEvidenceTierRubric,
  createMesoNode,
} from "./factory";
import {
  evaluateCondition,
  foldFramework,
  foldNodeConclusion,
  type SessionInputs,
  type SimInput,
} from "./simulateEvaluate";
import type {
  BooleanConditionNode,
  Comparator,
  ComparisonValue,
  Continuum,
  MesoNode,
  RubricCellCondition,
} from "./schema";

// ---- Small builders ----------------------------------------------------------

const term = (
  elementId: string,
  comparator: Comparator,
  value: ComparisonValue,
  valueLabel = value === null || typeof value === "object" ? "" : String(value),
): BooleanConditionNode => ({
  type: "TERM",
  term: {
    evidenceElementId: elementId,
    evidenceElementLabel: `[${elementId}]`,
    comparator,
    value,
    valueLabel,
  },
});

const cond = (root: BooleanConditionNode): RubricCellCondition => ({
  mode: "boolean",
  booleanLogic: { root, plainEnglish: toPlainEnglish(root) },
  lastModified: new Date().toISOString(),
});

/** A one-node subordinate layer with two columns and a linked method, whose
 *  two open cells carry the given conditions. Returns node + column ids. */
function twoColumnNode(
  sufficientCond: BooleanConditionNode,
  insufficientCond: BooleanConditionNode,
): { node: MesoNode; insuffId: string; suffId: string; methodId: string } {
  const doc = createEvaluationQuestion("t");
  const layer = doc.mesoLayers[0]!;
  const node = createMesoNode(layer, "Crit");
  const method = createEvidenceMethod("Observation");
  node.evidenceLinks.push(createEvidenceLink(method.id, node.id, ""));
  const [insuff, suff] = layer.continuum.columns;
  node.cells.find((c) => c.columnId === suff!.id)!.condition = cond(sufficientCond);
  node.cells.find((c) => c.columnId === insuff!.id)!.condition = cond(insufficientCond);
  return { node, insuffId: insuff!.id, suffId: suff!.id, methodId: method.id };
}

// ---- evaluateCondition (three-valued) ----------------------------------------

describe("evaluateCondition", () => {
  const values = (v: Record<string, SimInput>) => v;

  it("compares a strength term by rating order", () => {
    const t = term("m", "is_at_or_above", "Good");
    expect(evaluateCondition(t, values({ m: { kind: "strength", rating: "Strong" } }))).toBe("true");
    expect(evaluateCondition(t, values({ m: { kind: "strength", rating: "Good" } }))).toBe("true");
    expect(evaluateCondition(t, values({ m: { kind: "strength", rating: "Developing" } }))).toBe(
      "false",
    );
  });

  it("returns unknown when the referenced input is unset", () => {
    const t = term("m", "is", "Strong");
    expect(evaluateCondition(t, {})).toBe("unknown");
  });

  it("compares numeric (clarity/count) terms", () => {
    const t = term("clarity", "is_at_least", 3);
    expect(evaluateCondition(t, values({ clarity: { kind: "number", n: 4 } }))).toBe("true");
    expect(evaluateCondition(t, values({ clarity: { kind: "number", n: 2 } }))).toBe("false");
  });

  it("evaluates existence and pattern terms against booleans", () => {
    const exists = term("tier", "exists", null);
    expect(evaluateCondition(exists, values({ tier: { kind: "boolean", b: true } }))).toBe("true");
    const shows = term("m", "shows", "contradiction");
    // pattern terms read a per-flag slot
    expect(
      evaluateCondition(shows, values({ "m::pattern::contradiction": { kind: "boolean", b: true } })),
    ).toBe("true");
  });

  it("applies Kleene logic for AND / OR / NOT", () => {
    const a = term("a", "is", "Strong");
    const b = term("b", "is", "Strong");
    const and: BooleanConditionNode = { type: "AND", operands: [a, b] };
    const or: BooleanConditionNode = { type: "OR", operands: [a, b] };
    const strong = (): SimInput => ({ kind: "strength", rating: "Strong" });
    // AND: one false ⇒ false even if the other is unknown
    expect(evaluateCondition(and, values({ a: { kind: "strength", rating: "Good" } }))).toBe("false");
    // AND: all-but-one true, one unknown ⇒ unknown
    expect(evaluateCondition(and, values({ a: strong() }))).toBe("unknown");
    // OR: one true ⇒ true even with an unknown operand
    expect(evaluateCondition(or, values({ a: strong() }))).toBe("true");
    // NOT flips, leaves unknown unknown
    expect(evaluateCondition({ type: "NOT", operand: a }, values({ a: strong() }))).toBe("false");
    expect(evaluateCondition({ type: "NOT", operand: a }, {})).toBe("unknown");
  });
});

// ---- foldNodeConclusion ------------------------------------------------------

describe("foldNodeConclusion", () => {
  it("resolves to the single satisfied cell's column", () => {
    const { node, suffId, methodId } = twoColumnNode(
      term(/*sufficient*/ "", "is_at_or_above", "Good"),
      term(/*insufficient*/ "", "is_below", "Good"),
    );
    // rewrite the placeholder element ids to the real method id
    for (const cell of node.cells) {
      const root = cell.condition!.booleanLogic!.root;
      if (root.type === "TERM") root.term.evidenceElementId = methodId;
    }
    const result = foldNodeConclusion(node, { [methodId]: { kind: "strength", rating: "Strong" } });
    expect(result.status).toBe("resolved");
    expect(result.columnId).toBe(suffId);
    expect(result.firedCondition).toBeDefined();
  });

  it("flags ambiguity when two cells are satisfied at once (R-SIM-5)", () => {
    const { node, methodId } = twoColumnNode(
      term("", "is_at_or_above", "Developing"),
      term("", "is_at_or_above", "Developing"),
    );
    for (const cell of node.cells) {
      const root = cell.condition!.booleanLogic!.root;
      if (root.type === "TERM") root.term.evidenceElementId = methodId;
    }
    const result = foldNodeConclusion(node, { [methodId]: { kind: "strength", rating: "Strong" } });
    expect(result.status).toBe("ambiguous");
    expect(result.satisfiedColumnIds).toHaveLength(2);
  });

  it("is unknown, naming the missing element, when a value is unset (R-SIM-4)", () => {
    const { node, methodId } = twoColumnNode(
      term("", "is", "Strong"),
      term("", "is", "Not Yet"),
    );
    for (const cell of node.cells) {
      const root = cell.condition!.booleanLogic!.root;
      if (root.type === "TERM") {
        root.term.evidenceElementId = methodId;
        root.term.evidenceElementLabel = "[Observation]";
      }
    }
    const result = foldNodeConclusion(node, {}); // nothing set
    expect(result.status).toBe("unknown");
    expect(result.missingElementLabels).toContain("[Observation]");
  });

  it("is no_match when every condition is false", () => {
    const { node, methodId } = twoColumnNode(
      term("", "is", "Strong"),
      term("", "is", "Not Yet"),
    );
    for (const cell of node.cells) {
      const root = cell.condition!.booleanLogic!.root;
      if (root.type === "TERM") root.term.evidenceElementId = methodId;
    }
    const result = foldNodeConclusion(node, { [methodId]: { kind: "strength", rating: "Good" } });
    expect(result.status).toBe("no_match");
  });

  it("is no_conditions when the node has no Boolean conditions (prose only)", () => {
    const doc = createEvaluationQuestion("t");
    const node = createMesoNode(doc.mesoLayers[0]!, "Crit");
    expect(foldNodeConclusion(node, {}).status).toBe("no_conditions");
  });
});

// ---- foldFramework (multi-layer fold-up) -------------------------------------

describe("foldFramework", () => {
  /** Build: 1 criterion (2 cols) + an Overall Judgement (2 cols) whose Pass
   *  column fires when the criterion is at-or-above Sufficient. */
  function frameworkWithSynthesis() {
    const doc = createEvaluationQuestion("How good?");
    const layer = doc.mesoLayers[0]!;
    layer.continuum.columns[0]!.label = "Insufficient";
    layer.continuum.columns[1]!.label = "Sufficient";
    const [insuff, suff] = layer.continuum.columns;

    const node = createMesoNode(layer, "Teaching quality");
    const method = createEvidenceMethod("Observation");
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, ""));
    node.evidenceTier = createEvidenceTierRubric(node.id);
    node.cells.find((c) => c.columnId === suff!.id)!.condition = cond(
      term(method.id, "is_at_or_above", "Good", "Good"),
    );
    node.cells.find((c) => c.columnId === insuff!.id)!.condition = cond(
      term(method.id, "is_below", "Good", "Good"),
    );
    layer.nodes.push(node);

    const ojContinuum: Continuum = {
      id: crypto.randomUUID(),
      columns: [
        { id: crypto.randomUUID(), label: "Fail", ordinal: 1 },
        { id: crypto.randomUUID(), label: "Pass", ordinal: 2 },
      ],
      sufficientBarAfterOrdinal: 1,
    };
    const passId = ojContinuum.columns[1]!.id;
    doc.overallJudgement = {
      id: crypto.randomUUID(),
      continuum: ojContinuum,
      decisionRowEnabled: false,
      decisionCells: [],
      plainDescriptionCells: [],
      scenarios: [],
      conditionCells: [
        {
          columnId: passId,
          condition: cond(term(node.id, "is_at_or_above", { columnId: suff!.id }, "Sufficient")),
        },
      ],
    };
    return { doc, methodId: method.id, nodeId: node.id, suffId: suff!.id, passId };
  }

  it("folds evidence → criterion → simulated Overall Judgement", () => {
    const { doc, methodId, nodeId, suffId, passId } = frameworkWithSynthesis();
    const inputs: SessionInputs = { [`${nodeId}::${methodId}`]: "Strong" };
    const result = foldFramework(doc, inputs);
    expect(result.byNode[nodeId]?.status).toBe("resolved");
    expect(result.byNode[nodeId]?.columnId).toBe(suffId);
    expect(result.overall?.status).toBe("resolved");
    expect(result.overall?.columnId).toBe(passId);
  });

  it("propagates unknown upward when the evidence value is unset", () => {
    const { doc, nodeId } = frameworkWithSynthesis();
    const result = foldFramework(doc, {}); // nothing entered
    expect(result.byNode[nodeId]?.status).toBe("unknown");
    // an unresolved criterion means the synthesis can't be determined either
    expect(result.overall?.status).toBe("unknown");
  });

  it("yields a criterion no_match that leaves the synthesis undetermined", () => {
    const { doc, methodId, nodeId } = frameworkWithSynthesis();
    // Good is below the 'Good'-or-above bar? No — 'Good' satisfies at-or-above.
    // Use Developing so the Sufficient cell is false and Insufficient is true.
    const inputs: SessionInputs = { [`${nodeId}::${methodId}`]: "Developing" };
    const result = foldFramework(doc, inputs);
    expect(result.byNode[nodeId]?.status).toBe("resolved"); // Insufficient
    // criterion resolved to Insufficient ⇒ Pass condition is false ⇒ no_match
    expect(result.overall?.status).toBe("no_match");
  });
});
