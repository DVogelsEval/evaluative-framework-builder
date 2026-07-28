import { describe, expect, it } from "vitest";
import {
  comparatorsForElement,
  evidenceElementsForNode,
  hasBooleanElements,
  valuesForTerm,
  type EvidenceElement,
} from "./conditionLexicon";
import {
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createMesoNode,
  createOverallJudgement,
  createSecondMesoLayer,
} from "./factory";
import type { EvaluationQuestion, MesoNode } from "./schema";

/** A node with two linked methods, plus the doc it lives in. */
function docWithMethods(names: string[]): { doc: EvaluationQuestion; node: MesoNode } {
  const doc = createEvaluationQuestion("EQ");
  const layer = doc.mesoLayers[0]!;
  const node = createMesoNode(layer, "Quality");
  layer.nodes.push(node);
  for (const name of names) {
    const method = createEvidenceMethod(name);
    doc.evidenceMethods.push(method);
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, "Fits."));
  }
  return { doc, node };
}

const labels = (els: EvidenceElement[]): string[] => els.map((e) => e.label);

describe("evidenceElementsForNode (R-COND-3)", () => {
  it("offers each linked Evidence/Method plus the fixed tier/clarity/count elements", () => {
    const { doc, node } = docWithMethods(["Method A", "Method B"]);
    const els = evidenceElementsForNode(node, doc);
    expect(labels(els)).toEqual(
      expect.arrayContaining([
        "[Method A]",
        "[Method B]",
        "[Evidence Rubric Tier]",
        "[Evidence Data Description Tier]",
        "[Evidence Mixed-Method Tier]",
        "[Scenario Clarity]",
        "[Evidence Method Count]",
        "[Evidence Tier Count]",
        "[Strong Evidence Count]",
        "[Good Evidence Count]",
      ]),
    );
  });

  it("hides second-layer elements until a second meso layer exists (§B.5)", () => {
    const { doc, node } = docWithMethods(["Method A"]);
    expect(labels(evidenceElementsForNode(node, doc))).not.toContain("[Superior Layer Node]");
    doc.mesoLayers.push(createSecondMesoLayer("components"));
    expect(labels(evidenceElementsForNode(node, doc))).toEqual(
      expect.arrayContaining(["[Superior Layer Node]", "[Subordinate Node Exists]"]),
    );
  });

  it("hides synthesis elements until an Overall Judgement exists (§B.6)", () => {
    const { doc, node } = docWithMethods(["Method A"]);
    expect(labels(evidenceElementsForNode(node, doc))).not.toContain(
      "[Synthesis Scenarios Exist]",
    );
    doc.overallJudgement = createOverallJudgement([]);
    expect(labels(evidenceElementsForNode(node, doc))).toEqual(
      expect.arrayContaining(["[Synthesis Scenarios Exist]", "[Synthesis Clarity]"]),
    );
  });

  it("resolves method labels live from the pool (rename flows through)", () => {
    const { doc, node } = docWithMethods(["Old name"]);
    doc.evidenceMethods[0]!.name = "New name";
    expect(labels(evidenceElementsForNode(node, doc))).toContain("[New name]");
  });
});

describe("hasBooleanElements — mode default (R-COND-1/7)", () => {
  it("is true only when the node has evidence methods", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    layer.nodes.push(node);
    expect(hasBooleanElements(node)).toBe(false);
    const method = createEvidenceMethod("M");
    doc.evidenceMethods.push(method);
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, ""));
    expect(hasBooleanElements(node)).toBe(true);
  });
});

describe("comparatorsForElement (R-COND-4)", () => {
  it("a strength-rated method offers the five strength comparators (plus its pattern set)", () => {
    const method: EvidenceElement = {
      id: "m",
      label: "[M]",
      classes: ["strength", "pattern"],
    };
    const comps = comparatorsForElement(method);
    expect(comps).toEqual(
      expect.arrayContaining(["is", "is_not", "is_at_or_above", "is_above", "is_below"]),
    );
    expect(comps).toEqual(expect.arrayContaining(["shows", "does_not_show"]));
  });

  it("a count element offers only the numeric comparators", () => {
    const count: EvidenceElement = { id: "c", label: "[C]", classes: ["count"] };
    expect(comparatorsForElement(count)).toEqual([
      "is_exactly",
      "is_at_least",
      "is_more_than",
      "is_fewer_than",
      "is_at_most",
    ]);
  });

  it("an existence element offers only exists / does not exist", () => {
    const tier: EvidenceElement = { id: "t", label: "[T]", classes: ["existence"] };
    expect(comparatorsForElement(tier)).toEqual(["exists", "does_not_exist"]);
  });
});

describe("valuesForTerm (R-COND-4)", () => {
  const method: EvidenceElement = { id: "m", label: "[M]", classes: ["strength", "pattern"] };
  const clarity: EvidenceElement = { id: "cl", label: "[Cl]", classes: ["clarity"] };
  const count: EvidenceElement = { id: "co", label: "[Co]", classes: ["count"] };
  const tier: EvidenceElement = { id: "t", label: "[T]", classes: ["existence"] };

  it("strength values for a rated element", () => {
    expect(valuesForTerm(method, "is_at_or_above")).toEqual({
      kind: "strength",
      options: ["Strong", "Good", "Developing", "Not Yet"],
    });
  });

  it("clarity is a 1–5 number", () => {
    expect(valuesForTerm(clarity, "is_at_least")).toEqual({ kind: "number", min: 1, max: 5 });
  });

  it("counts are an open number ≥ 0", () => {
    expect(valuesForTerm(count, "is_at_least")).toEqual({ kind: "number", min: 0 });
  });

  it("existence comparators take no value", () => {
    expect(valuesForTerm(tier, "exists")).toEqual({ kind: "none" });
  });

  it("pattern comparators take the named flags", () => {
    expect(valuesForTerm(method, "shows")).toEqual({
      kind: "pattern",
      options: ["contradiction", "regression", "inconsistency", "gap", "framework_drift"],
    });
  });
});
