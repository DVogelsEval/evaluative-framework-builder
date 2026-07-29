import { describe, expect, it } from "vitest";
import { createEvaluationQuestion, createMesoNode } from "./factory";
import {
  entriesForNodeAndDescendants,
  entriesForRef,
  labelForRef,
  parseRef,
  refForBar,
  refForCell,
  refForCondition,
  refForColumn,
  refForEq,
  refForImportance,
  refForJudgement,
  refForJudgementColumn,
  refForSimCase,
  refForLayer,
  refForNode,
} from "./recordRef";

describe("recordRef builders + parser round-trip", () => {
  it("round-trips every ref shape", () => {
    expect(parseRef(refForEq())).toEqual({ kind: "eq" });
    expect(parseRef(refForLayer("L1"))).toEqual({ kind: "layer", layerId: "L1" });
    expect(parseRef(refForBar("L1"))).toEqual({ kind: "bar", layerId: "L1" });
    expect(parseRef(refForColumn("L1", "C1"))).toEqual({
      kind: "column",
      layerId: "L1",
      columnId: "C1",
    });
    expect(parseRef(refForNode("N1"))).toEqual({ kind: "node", nodeId: "N1" });
    expect(parseRef(refForImportance("N1"))).toEqual({ kind: "importance", nodeId: "N1" });
    expect(parseRef(refForCell("N1", "X1"))).toEqual({ kind: "cell", nodeId: "N1", cellId: "X1" });
    expect(parseRef(refForCondition("N1", "X1"))).toEqual({
      kind: "condition",
      nodeId: "N1",
      cellId: "X1",
    });
    expect(parseRef(refForJudgement())).toEqual({ kind: "judgement" });
    expect(parseRef(refForJudgementColumn("J1"))).toEqual({
      kind: "judgementColumn",
      columnId: "J1",
    });
    expect(parseRef(refForSimCase("C1"))).toEqual({ kind: "simCase", simCaseId: "C1" });
  });

  it("returns null for malformed or unknown refs", () => {
    expect(parseRef("")).toBeNull();
    expect(parseRef("nonsense")).toBeNull();
    expect(parseRef("node:N1/cell:X1/extra")).toBeNull();
    expect(parseRef("layer:L1/nonsense")).toBeNull();
    expect(parseRef("judgement/nonsense")).toBeNull();
  });
});

describe("labelForRef — live resolution against the current document", () => {
  it("resolves eq, layer, node, cell and column labels from the current state", () => {
    const doc = createEvaluationQuestion("How good is it?");
    doc.title = "Reading program quality";
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Teaching quality");
    layer.nodes.push(node);
    layer.continuum.columns[0]!.label = "Insufficient";

    expect(labelForRef(doc, refForEq())).toBe("Reading program quality");
    expect(labelForRef(doc, refForLayer(layer.id))).toBe("Criteria layer");
    expect(labelForRef(doc, refForBar(layer.id))).toBe("Sufficient Bar");
    expect(labelForRef(doc, refForNode(node.id))).toBe("Teaching quality");
    expect(labelForRef(doc, refForColumn(layer.id, layer.continuum.columns[0]!.id))).toBe(
      'Column Header "Insufficient"',
    );
    expect(labelForRef(doc, refForCell(node.id, node.cells[0]!.id))).toBe(
      "Teaching quality — Insufficient",
    );
    expect(labelForRef(doc, refForCondition(node.id, node.cells[0]!.id))).toBe(
      "Teaching quality — Insufficient condition",
    );
    expect(labelForRef(doc, refForImportance(node.id))).toBe(
      "Teaching quality — importance/reach",
    );
  });

  it("resolves the Overall Judgement and its columns when present", () => {
    const doc = createEvaluationQuestion("How good is it?");
    doc.overallJudgement = {
      id: "oj",
      continuum: {
        id: "c",
        columns: [{ id: "col1", label: "Weak", ordinal: 1 }],
        sufficientBarAfterOrdinal: 0,
      },
      decisionRowEnabled: false,
      decisionCells: [],
      plainDescriptionCells: [],
      scenarios: [],
    };
    expect(labelForRef(doc, refForJudgement())).toBe("Overall Judgement");
    expect(labelForRef(doc, refForJudgementColumn("col1"))).toBe('Overall Judgement — "Weak"');
  });

  it("degrades gracefully once the referenced element is deleted, never throwing", () => {
    const doc = createEvaluationQuestion("How good is it?");
    expect(labelForRef(doc, refForNode("gone"))).toBe("(deleted node)");
    expect(labelForRef(doc, refForCell("gone", "also-gone"))).toBe("(deleted cell)");
    expect(labelForRef(doc, refForCondition("gone", "also-gone"))).toBe(
      "(deleted cell's condition)",
    );
    expect(labelForRef(doc, refForLayer("gone"))).toBe("(deleted layer)");
    expect(labelForRef(doc, refForColumn("gone", "gone"))).toBe("(deleted column)");
    expect(labelForRef(doc, refForJudgementColumn("gone"))).toBe("(deleted judgement column)");
    expect(labelForRef(doc, refForSimCase("gone"))).toBe("(deleted case)");
    expect(labelForRef(doc, "not a real ref")).toBe("(unresolvable reference)");
  });

  it("resolves a live SimCase by its current label (V2 Phase 2.4)", () => {
    const doc = createEvaluationQuestion("How good is it?");
    doc.simCases.push({ id: "c1", label: "Borderline case", prose: "", values: {} });
    expect(labelForRef(doc, refForSimCase("c1"))).toBe('Case "Borderline case"');
  });
});

describe("entriesForRef — the element-history strip's data source", () => {
  it("filters to exactly the matching ref, newest first, including withheld entries", () => {
    const doc = createEvaluationQuestion("EQ");
    const older = {
      id: "1",
      elementRef: "layer:L1/column:C1",
      timestamp: "2026-07-01T00:00:00.000Z",
      author: "A",
      changeSummary: "First",
      reason: "R1",
      prompt: "other" as const,
      includeInExport: false,
    };
    const newer = {
      id: "2",
      elementRef: "layer:L1/column:C1",
      timestamp: "2026-07-02T00:00:00.000Z",
      author: "B",
      changeSummary: "Second",
      reason: "R2",
      prompt: "other" as const,
      includeInExport: true,
    };
    const other = {
      id: "3",
      elementRef: "layer:L1/column:C2",
      timestamp: "2026-07-03T00:00:00.000Z",
      author: "C",
      changeSummary: "Unrelated",
      reason: "R3",
      prompt: "other" as const,
      includeInExport: true,
    };
    doc.records = [older, newer, other];
    expect(entriesForRef(doc, "layer:L1/column:C1")).toEqual([newer, older]);
  });

  it("returns an empty array for a ref with no history", () => {
    const doc = createEvaluationQuestion("EQ");
    expect(entriesForRef(doc, "eq")).toEqual([]);
  });
});

describe("entriesForNodeAndDescendants — the criterion timeline's data source (V2 §3.1)", () => {
  it("gathers node, importance, cell and condition entries for that node, newest first", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Teaching quality");
    layer.nodes.push(node);
    const cellId = node.cells[0]!.id;

    const entry = (id: string, elementRef: string, timestamp: string) => ({
      id,
      elementRef,
      timestamp,
      author: "",
      changeSummary: id,
      reason: "r",
      prompt: "other" as const,
      includeInExport: true,
    });

    doc.records = [
      entry("1", refForNode(node.id), "2026-07-01T00:00:00.000Z"),
      entry("2", refForImportance(node.id), "2026-07-02T00:00:00.000Z"),
      entry("3", refForCell(node.id, cellId), "2026-07-03T00:00:00.000Z"),
      entry("4", refForCondition(node.id, cellId), "2026-07-04T00:00:00.000Z"),
      entry("5", refForNode("some-other-node"), "2026-07-05T00:00:00.000Z"),
      entry("6", refForEq(), "2026-07-06T00:00:00.000Z"),
    ];

    const entries = entriesForNodeAndDescendants(doc, node.id);
    expect(entries.map((e) => e.id)).toEqual(["4", "3", "2", "1"]);
  });

  it("returns an empty array for a node with no history", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "N");
    layer.nodes.push(node);
    expect(entriesForNodeAndDescendants(doc, node.id)).toEqual([]);
  });
});
