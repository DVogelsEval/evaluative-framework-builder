import { beforeEach, describe, expect, it } from "vitest";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import {
  checkContinuum,
  checkDocument,
  checkEvidenceTier,
  checkEvidenceTierComplete,
  checkMixedMethods,
  checkNodeCells,
  checkScenariosComplete,
  checkSubMethodRetention,
  checkSynthesisComplete,
} from "../domain/invariants";
import { scenarioDescribed, scenarioPlainText } from "../domain/scenario";
import { evaluationQuestionSchema } from "../domain/schema";
import { evalqFileName, useStore } from "./store";
import { evidenceIncomplete } from "./wizard";

beforeEach(() => {
  useStore.setState({
    project: null,
    doc: null,
    view: "start",
    focusNodeId: null,
    evidenceReturnTo: null,
  });
});

/** Drive the store through the whole Slice-0 path. */
function buildSkeleton() {
  const s = () => useStore.getState();
  s().createProject("Demo Project");
  s().createEQ("Reading program quality");
  s().setQuestionText("How good is the reading program?");
  const layer = s().doc!.mesoLayers[0]!;
  s().setColumnLabel(layer.continuum.columns[0]!.id, "Insufficient");
  s().setColumnLabel(layer.continuum.columns[1]!.id, "Sufficient");
  s().addNode("Teaching quality");
  const node = () => s().doc!.mesoLayers[0]!.nodes[0]!;
  for (const cell of node().cells) {
    s().setCellPlainDescription(node().id, cell.id, `Looks like this at ${cell.columnId}.`);
  }
  s().addEvidenceMethod(node().id, {
    name: "Classroom observation",
    whatWillBeDone: "Observe ten reading lessons.",
    fitJustification: "Directly observes teaching quality.",
  });
  s().chooseEvidenceTier(node().id, "list");
  s().setDataDescription(
    node().id,
    s().doc!.evidenceMethods[0]!.id,
    "Observation notes for ten classes.",
  );
  for (const cell of node().cells) {
    s().addScenario(node().id, cell.id);
    const scenario = node().cells.find((c) => c.id === cell.id)!.scenarios[0]!;
    s().updateScenarioParts(node().id, cell.id, scenario.id, [
      { kind: "text", text: "Observation notes place the teaching here." },
    ]);
  }
}

describe("domain store — thin wrapper over the document (R-013)", () => {
  it("creates a Project and embeds the new EQ in it (Q1, revised)", () => {
    useStore.getState().createProject("Demo Project");
    useStore.getState().createEQ("Reading program quality");
    const { project, doc } = useStore.getState();
    expect(project?.name).toBe("Demo Project");
    expect(project?.evaluationQuestions).toHaveLength(1);
    expect(project?.evaluationQuestions[0]?.id).toBe(doc!.id);
    expect(project?.evaluationQuestions[0]?.title).toBe("Reading program quality");
  });

  it("opens an embedded EQ from the Project without a file pick (Q1, revised)", () => {
    useStore.getState().createProject("Demo Project");
    useStore.getState().createEQ("First question");
    const firstId = useStore.getState().doc!.id;
    useStore.getState().createEQ("Second question");
    expect(useStore.getState().project?.evaluationQuestions).toHaveLength(2);
    useStore.getState().openEvaluationQuestion(firstId);
    expect(useStore.getState().doc?.id).toBe(firstId);
    expect(useStore.getState().doc?.title).toBe("First question");
  });

  it("starting a new Project replaces it but keeps the open EQ (⚠Q40)", () => {
    buildSkeleton();
    const before = useStore.getState().doc!;
    useStore.getState().createProject("Second Project");
    const { project, doc } = useStore.getState();
    expect(project?.name).toBe("Second Project");
    expect(project?.evaluationQuestions).toEqual([]);
    expect(doc).toBe(before);
  });

  it("assigns UUIDs on create", () => {
    buildSkeleton();
    const doc = useStore.getState().doc!;
    const node = doc.mesoLayers[0]!.nodes[0]!;
    for (const id of [doc.id, node.id, node.cells[0]!.id, doc.evidenceMethods[0]!.id]) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("creates one cell per continuum column on addNode (Invariant 5)", () => {
    buildSkeleton();
    const layer = useStore.getState().doc!.mesoLayers[0]!;
    expect(layer.nodes[0]!.cells.map((c) => c.columnId).sort()).toEqual(
      layer.continuum.columns.map((c) => c.id).sort(),
    );
  });

  it("clears withheld content when a cell is excluded (Invariant 6)", () => {
    buildSkeleton();
    const s = () => useStore.getState();
    // Two positive columns, so one can be closed under the ≥1-per-side guard.
    s().addColumn("positive");
    const node = () => s().doc!.mesoLayers[0]!.nodes[0]!;
    const outer = positiveColumns(s().doc!.mesoLayers[0]!.continuum)[1]!;
    const cell = node().cells.find((c) => c.columnId === outer.id)!;
    s().setCellPlainDescription(node().id, cell.id, "Withheld when excluded.");
    s().toggleCellIncluded(node().id, cell.id);
    const toggled = node().cells.find((c) => c.id === cell.id)!;
    expect(toggled.included).toBe(false);
    expect(toggled.plainDescription).toBeUndefined();
    expect(toggled.scenarios).toEqual([]);
  });

  it("addEvidenceMethod pools the method and links it; the list tier completes (Invariant 8)", () => {
    buildSkeleton();
    const doc = useStore.getState().doc!;
    const node = doc.mesoLayers[0]!.nodes[0]!;
    expect(doc.evidenceMethods).toHaveLength(1);
    expect(node.evidenceLinks[0]!.evidenceMethodId).toBe(doc.evidenceMethods[0]!.id);
    expect(node.evidenceLinks[0]!.fitJustification).toBe(
      "Directly observes teaching quality.",
    );
    expect(node.evidenceTier?.shape).toBe("list");
    expect(checkEvidenceTier(node)).toEqual([]);
  });

  it("produces a schema-valid document with no invariant issues end-to-end", () => {
    buildSkeleton();
    const doc = useStore.getState().doc!;
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
    expect(checkDocument(doc)).toEqual([]);
  });

  it("stamps updatedAt on mutation", () => {
    buildSkeleton();
    const doc = useStore.getState().doc!;
    expect(Date.parse(doc.updatedAt)).toBeGreaterThanOrEqual(Date.parse(doc.createdAt));
  });
});

describe("value-language highlighting (R-034/R-035, Q34)", () => {
  const openQuestion = (text: string) => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    s().setQuestionText(text);
    return s;
  };

  it("adds, dedupes overlaps, and removes value spans", () => {
    const s = openQuestion("How good and effective is it?");
    s().addValueSpan(4, 8, "good");
    s().addValueSpan(13, 22, "effective");
    s().addValueSpan(5, 7, "oo"); // overlaps "good" → ignored
    expect(s().doc!.valueLanguage!.map((v) => v.text)).toEqual(["good", "effective"]);
    const id = s().doc!.valueLanguage![0]!.id;
    s().removeValueSpan(id);
    expect(s().doc!.valueLanguage!.map((v) => v.text)).toEqual(["effective"]);
  });

  it("drops spans whose offsets no longer match after an edit", () => {
    const s = openQuestion("How good is it?");
    s().addValueSpan(4, 8, "good");
    s().setQuestionText("Totally different question."); // offsets 4-8 no longer "good"
    expect(s().doc!.valueLanguage).toEqual([]);
  });

  it("seeds empty positive headers from the spans, bar-outward (GWT-2.2)", () => {
    const s = openQuestion("How good is it?");
    s().addColumn("positive"); // 1 neg + 2 pos, all blank
    s().addValueSpan(4, 8, "good");
    s().seedContinuumFromValueLanguage();
    const pos = positiveColumns(s().doc!.mesoLayers[0]!.continuum);
    expect(pos[0]!.label).toBe("good");
    expect(pos[1]!.label).toBe(""); // only one span → one header seeded
  });
});

describe("continuum column editing (R-040/R-041/R-158, GWT-2.3/2.4)", () => {
  const openContinuum = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    return s;
  };

  it("adds positive/negative columns, allowing unequal sides", () => {
    const s = openContinuum();
    s().addColumn("positive");
    s().addColumn("positive");
    const c = s().doc!.mesoLayers[0]!.continuum;
    expect(negativeColumns(c)).toHaveLength(1);
    expect(positiveColumns(c)).toHaveLength(3);
    expect(checkContinuum(c)).toEqual([]);
  });

  it("refuses to remove the last column on a side (≥1 each side)", () => {
    const s = openContinuum();
    const c0 = s().doc!.mesoLayers[0]!.continuum;
    const lonePositive = positiveColumns(c0)[0]!.id;
    s().removeColumn(lonePositive);
    expect(positiveColumns(s().doc!.mesoLayers[0]!.continuum)).toHaveLength(1); // unchanged
  });

  it("removes a column and re-syncs every node's cells to the new column set (Invariant 5)", () => {
    const s = openContinuum();
    s().setQuestionText("Q");
    const layer0 = s().doc!.mesoLayers[0]!;
    s().setColumnLabel(layer0.continuum.columns[0]!.id, "Below");
    s().setColumnLabel(layer0.continuum.columns[1]!.id, "Above");
    s().addColumn("positive"); // 1 neg + 2 pos
    s().addNode("Quality");
    // node now has 3 cells; drop a positive column and confirm cells re-sync
    const posToRemove = positiveColumns(s().doc!.mesoLayers[0]!.continuum)[0]!.id;
    s().removeColumn(posToRemove);
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    expect(node.cells).toHaveLength(layer.continuum.columns.length);
    expect(checkNodeCells(node, layer.continuum)).toEqual([]);
  });
});

describe("node list — add/remove/reorder + fields (R-049–R-053, R-156/R-157)", () => {
  const open = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    return s;
  };

  it("addNode starts with empty fields and one open cell per column (GWT-4.1)", () => {
    const s = open();
    s().addNode();
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    expect(node.name).toBe("");
    expect(node.linkToQuestion).toBe("");
    expect(node.linkToValues).toBe("");
    expect(node.decisionsOrUse).toBe("");
    expect(node.cells).toHaveLength(layer.continuum.columns.length);
    expect(node.cells.every((c) => c.included)).toBe(true);
  });

  it("updateNodeField edits the name and the three warrant fields", () => {
    const s = open();
    s().addNode();
    const id = s().doc!.mesoLayers[0]!.nodes[0]!.id;
    s().updateNodeField(id, "name", "Teaching quality");
    s().updateNodeField(id, "linkToQuestion", "Central to program quality.");
    s().updateNodeField(id, "linkToValues", "Parents value good teaching.");
    s().updateNodeField(id, "decisionsOrUse", "Guides staff development.");
    const node = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(node.name).toBe("Teaching quality");
    expect(node.linkToQuestion).toBe("Central to program quality.");
    expect(node.linkToValues).toBe("Parents value good teaching.");
    expect(node.decisionsOrUse).toBe("Guides staff development.");
  });

  it("removeNode moves the node to the RecycleBin and renumbers (Invariant 20)", () => {
    const s = open();
    s().addNode("A");
    s().addNode("B");
    s().addNode("C");
    const b = s().doc!.mesoLayers[0]!.nodes[1]!;
    s().removeNode(b.id);
    const doc = s().doc!;
    expect(doc.mesoLayers[0]!.nodes.map((n) => n.name)).toEqual(["A", "C"]);
    expect(doc.mesoLayers[0]!.nodes.map((n) => n.order)).toEqual([0, 1]);
    expect(doc.recycleBin.deletedNodes).toHaveLength(1);
    expect((doc.recycleBin.deletedNodes[0]!.node as { id: string }).id).toBe(b.id);
  });

  it("moveNode reorders and keeps order contiguous (R-157)", () => {
    const s = open();
    s().addNode("A");
    s().addNode("B");
    s().addNode("C");
    const c = s().doc!.mesoLayers[0]!.nodes[2]!;
    s().moveNode(c.id, -1);
    expect(s().doc!.mesoLayers[0]!.nodes.map((n) => n.name)).toEqual(["A", "C", "B"]);
    expect(s().doc!.mesoLayers[0]!.nodes.map((n) => n.order)).toEqual([0, 1, 2]);
    s().moveNode(c.id, -1);
    s().moveNode(c.id, -1); // already first — no-op
    expect(s().doc!.mesoLayers[0]!.nodes.map((n) => n.name)).toEqual(["C", "A", "B"]);
  });

  it("setLayerKind relabels without touching structure (R-048/Q15)", () => {
    const s = open();
    s().addNode("A");
    const before = s().doc!.mesoLayers[0]!.nodes;
    s().setLayerKind("components");
    const layer = s().doc!.mesoLayers[0]!;
    expect(layer.kind).toBe("components");
    expect(layer.nodes).toEqual(before);
  });
});

describe("importance / reach (R-054/R-055, Q6/Q11, ⚠Q36)", () => {
  const openWithColumns = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    s().addColumn("positive"); // 1 neg + 2 pos
    s().addNode("Quality");
    return s;
  };

  it("marks are qualitative booleans only — never a numeric weight (GWT-4.3)", () => {
    const s = openWithColumns();
    const node = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(node.importance).toHaveLength(3);
    for (const mark of node.importance!) {
      expect(typeof mark.reach).toBe("boolean");
    }
    expect(JSON.stringify(node.importance)).not.toMatch(/weight|score|rank/i);
  });

  it("deselecting a column closes its cell and clears content (Q6 → Invariant 6)", () => {
    const s = openWithColumns();
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    const outerPositive = positiveColumns(layer.continuum)[1]!;
    const cell = node.cells.find((c) => c.columnId === outerPositive.id)!;
    s().setCellPlainDescription(node.id, cell.id, "text");
    s().setImportanceReach(node.id, outerPositive.id, false);
    const after = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(after.importance!.find((m) => m.columnId === outerPositive.id)!.reach).toBe(false);
    const afterCell = after.cells.find((c) => c.columnId === outerPositive.id)!;
    expect(afterCell.included).toBe(false);
    expect(afterCell.plainDescription).toBeUndefined();
  });

  it("refuses to deselect the last reachable column on a side (Q7/⚠Q36)", () => {
    const s = openWithColumns();
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    const loneNegative = negativeColumns(layer.continuum)[0]!;
    s().setImportanceReach(node.id, loneNegative.id, false);
    const after = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(after.cells.find((c) => c.columnId === loneNegative.id)!.included).toBe(true);
  });

  it("reselecting reopens the cell", () => {
    const s = openWithColumns();
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    const outerPositive = positiveColumns(layer.continuum)[1]!;
    s().setImportanceReach(node.id, outerPositive.id, false);
    s().setImportanceReach(node.id, outerPositive.id, true);
    const after = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(after.cells.find((c) => c.columnId === outerPositive.id)!.included).toBe(true);
  });

  it("toggleCellIncluded refuses to close the last open cell on a side (SPEC J5)", () => {
    const s = openWithColumns();
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    const loneNegativeCell = node.cells.find(
      (c) => c.columnId === negativeColumns(layer.continuum)[0]!.id,
    )!;
    s().toggleCellIncluded(node.id, loneNegativeCell.id);
    const after = s().doc!.mesoLayers[0]!.nodes[0]!;
    expect(after.cells.find((c) => c.id === loneNegativeCell.id)!.included).toBe(true);
  });

  it("a column added later gets an open cell and a reach mark on every node", () => {
    const s = openWithColumns();
    s().addColumn("negative");
    const layer = s().doc!.mesoLayers[0]!;
    const node = layer.nodes[0]!;
    expect(node.cells).toHaveLength(layer.continuum.columns.length);
    expect(node.importance).toHaveLength(layer.continuum.columns.length);
    expect(node.importance!.every((m) => typeof m.reach === "boolean")).toBe(true);
  });
});

describe("evidence pool, reuse & dedupe (J7, R-079–R-082)", () => {
  const openTwoNodes = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    s().addNode("A");
    s().addNode("B");
    s().addEvidenceMethod(s().doc!.mesoLayers[0]!.nodes[0]!.id, {
      name: "Observation",
      whatWillBeDone: "Observe lessons.",
      fitJustification: "Fits A directly.",
    });
    return s;
  };

  it("reuse links the pooled method; fields travel, fit justification starts empty (GWT-7.1)", () => {
    const s = openTwoNodes();
    const method = s().doc!.evidenceMethods[0]!;
    const nodeB = s().doc!.mesoLayers[0]!.nodes[1]!;
    s().reuseEvidenceMethod(nodeB.id, method.id);
    const doc = s().doc!;
    expect(doc.evidenceMethods).toHaveLength(1); // shared, not copied
    const linkB = doc.mesoLayers[0]!.nodes[1]!.evidenceLinks[0]!;
    expect(linkB.evidenceMethodId).toBe(method.id);
    expect(linkB.fitJustification).toBe("");
    // editing the method is visible from both nodes (information travels)
    s().updateEvidenceMethod(method.id, "whatWillBeDone", "Observe twenty lessons.");
    expect(s().doc!.evidenceMethods[0]!.whatWillBeDone).toBe("Observe twenty lessons.");
  });

  it("reuse refuses a method already linked to the node", () => {
    const s = openTwoNodes();
    const nodeA = s().doc!.mesoLayers[0]!.nodes[0]!;
    s().reuseEvidenceMethod(nodeA.id, s().doc!.evidenceMethods[0]!.id);
    expect(s().doc!.mesoLayers[0]!.nodes[0]!.evidenceLinks).toHaveLength(1);
  });

  it("dedupe-links two methods symmetrically and unlinks them (R-081/GWT-7.2)", () => {
    const s = openTwoNodes();
    s().addEvidenceMethod(s().doc!.mesoLayers[0]!.nodes[1]!.id, {
      name: "Lesson observation",
      whatWillBeDone: "",
      fitJustification: "Fits B.",
    });
    const [a, b] = s().doc!.evidenceMethods;
    s().linkMethodsAsSame(a!.id, b!.id);
    let methods = s().doc!.evidenceMethods;
    expect(methods[0]!.dedupeLinkedIds).toEqual([b!.id]);
    expect(methods[1]!.dedupeLinkedIds).toEqual([a!.id]);
    s().linkMethodsAsSame(a!.id, b!.id); // idempotent
    expect(s().doc!.evidenceMethods[0]!.dedupeLinkedIds).toEqual([b!.id]);
    s().unlinkMethods(a!.id, b!.id);
    methods = s().doc!.evidenceMethods;
    expect(methods[0]!.dedupeLinkedIds).toEqual([]);
    expect(methods[1]!.dedupeLinkedIds).toEqual([]);
  });

  it("removing a link recycles it; the method stays in the pool (Invariant 20, R-079)", () => {
    const s = openTwoNodes();
    const nodeA = s().doc!.mesoLayers[0]!.nodes[0]!;
    s().removeEvidenceLink(nodeA.id, nodeA.evidenceLinks[0]!.id);
    const doc = s().doc!;
    expect(doc.mesoLayers[0]!.nodes[0]!.evidenceLinks).toEqual([]);
    expect(doc.evidenceMethods).toHaveLength(1);
    expect(doc.recycleBin.deletedNodes).toHaveLength(1);
  });
});

describe("evidence-tier fork (J8, R-074–R-076, Q13/Q32/⚠Q37)", () => {
  const openWithMethod = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    s().addNode("A");
    const nodeId = s().doc!.mesoLayers[0]!.nodes[0]!.id;
    s().addEvidenceMethod(nodeId, {
      name: "Observation",
      whatWillBeDone: "",
      fitJustification: "Fits.",
    });
    return { s, nodeId };
  };
  const node = () => useStore.getState().doc!.mesoLayers[0]!.nodes[0]!;

  it("choosing a shape creates it; switching recycles the old tier (Invariant 20)", () => {
    const { s, nodeId } = openWithMethod();
    s().chooseEvidenceTier(nodeId, "list");
    expect(node().evidenceTier?.shape).toBe("list");
    s().chooseEvidenceTier(nodeId, "list"); // same shape — keeps work, no recycle
    expect(useStore.getState().doc!.recycleBin.deletedNodes).toHaveLength(0);
    s().chooseEvidenceTier(nodeId, "rubric");
    expect(node().evidenceTier?.shape).toBe("rubric");
    expect(useStore.getState().doc!.recycleBin.deletedNodes).toHaveLength(1);
  });

  it("setDataDescription upserts the method's own entry; empty text drops it (Q37, 2026-07-14 notes)", () => {
    const { s, nodeId } = openWithMethod();
    s().chooseEvidenceTier(nodeId, "list");
    expect(checkEvidenceTierComplete(node())).toHaveLength(1); // method uncovered
    const methodId = useStore.getState().doc!.evidenceMethods[0]!.id;
    s().setDataDescription(nodeId, methodId, "Observation notes.");
    expect(checkEvidenceTierComplete(node())).toEqual([]);
    const entries = () => (node().evidenceTier as { entries: unknown[] }).entries;
    expect(entries()).toEqual([
      { evidenceMethodId: methodId, description: "Observation notes." },
    ]);
    s().setDataDescription(nodeId, methodId, "Observation notes, updated."); // upsert, not append
    expect(entries()).toHaveLength(1);
    s().setDataDescription(nodeId, crypto.randomUUID(), "Stray."); // unlinked method: refused
    expect(entries()).toHaveLength(1);
    s().setDataDescription(nodeId, methodId, ""); // emptied → entry drops, method uncovered again
    expect(entries()).toEqual([]);
    expect(checkEvidenceTierComplete(node())).toHaveLength(1);
  });

  it("legacy free entries stay editable/removable but never cover a method (Q37, 2026-07-14 notes)", () => {
    const { s, nodeId } = openWithMethod();
    s().chooseEvidenceTier(nodeId, "list");
    // simulate an older document's untied entry
    const tier = node().evidenceTier;
    if (tier?.shape === "list") tier.entries.push({ description: "Old free entry." });
    s().updateDataEntry(nodeId, 0, { description: "Old free entry, edited." });
    expect(checkEvidenceTierComplete(node())).toHaveLength(1); // method still uncovered
    s().removeDataEntry(nodeId, 0);
    expect((node().evidenceTier as { entries: unknown[] }).entries).toEqual([]);
  });

  it("list completeness gates while any linked method is undescribed — 2 methods, 1 described (Q37)", () => {
    const { s, nodeId } = openWithMethod();
    s().addEvidenceMethod(nodeId, {
      name: "Survey",
      whatWillBeDone: "Survey parents.",
      fitJustification: "Captures perceived quality.",
    });
    s().chooseEvidenceTier(nodeId, "list");
    const [observation, survey] = useStore.getState().doc!.evidenceMethods;
    s().setDataDescription(nodeId, observation!.id, "Observation notes.");
    expect(checkEvidenceTierComplete(node())).toHaveLength(1); // survey uncovered → gates
    s().setDataDescription(nodeId, survey!.id, "Survey results.");
    expect(checkEvidenceTierComplete(node())).toEqual([]);
  });

  it("evidence rubric: headers + a level description per method complete it (R-075, ⚠Q37)", () => {
    const { s, nodeId } = openWithMethod();
    s().chooseEvidenceTier(nodeId, "rubric");
    expect(checkEvidenceTierComplete(node()).length).toBeGreaterThan(0); // blank headers
    const tier = () =>
      node().evidenceTier?.shape === "rubric" ? node().evidenceTier : undefined;
    const columns = () => (tier() as { continuum: { columns: { id: string; label: string }[] } }).continuum.columns;
    s().setEvidenceColumnLabel(nodeId, columns()[0]!.id, "Weak data");
    s().setEvidenceColumnLabel(nodeId, columns()[1]!.id, "Strong data");
    expect(checkEvidenceTierComplete(node())).toHaveLength(1); // method undescribed
    const methodId = useStore.getState().doc!.evidenceMethods[0]!.id;
    s().setMethodLevelDescription(nodeId, methodId, columns()[1]!.id, "Full notes set.");
    expect(checkEvidenceTierComplete(node())).toEqual([]);
    // emptying the description drops its cell
    s().setMethodLevelDescription(nodeId, methodId, columns()[1]!.id, "");
    expect(
      (node().evidenceTier as { methodLevelCells: unknown[] }).methodLevelCells,
    ).toEqual([]);
  });

  it("evidence rubric columns: add per side, refuse removing the last on a side", () => {
    const { s, nodeId } = openWithMethod();
    s().chooseEvidenceTier(nodeId, "rubric");
    s().addEvidenceColumn(nodeId, "positive");
    const tier = node().evidenceTier as { continuum: Parameters<typeof positiveColumns>[0] };
    expect(positiveColumns(tier.continuum)).toHaveLength(2);
    const loneNegative = negativeColumns(tier.continuum)[0]!;
    s().removeEvidenceColumn(nodeId, loneNegative.id);
    const after = node().evidenceTier as { continuum: Parameters<typeof negativeColumns>[0] };
    expect(negativeColumns(after.continuum)).toHaveLength(1); // unchanged
  });
});

describe("mixed-methods step (J9, R-162–R-175, Q27/Q28/⚠Q38/⚠Q39)", () => {
  const openWithTwoMethods = () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    s().addNode("A");
    const nodeId = s().doc!.mesoLayers[0]!.nodes[0]!.id;
    s().addEvidenceMethod(nodeId, {
      name: "Observation",
      whatWillBeDone: "Observe lessons.",
      fitJustification: "Fits.",
    });
    s().addEvidenceMethod(nodeId, {
      name: "Survey",
      whatWillBeDone: "Survey parents.",
      fitJustification: "Fits too.",
    });
    return { s, nodeId };
  };
  const node = () => useStore.getState().doc!.mesoLayers[0]!.nodes[0]!;
  const pool = () => useStore.getState().doc!.evidenceMethods;

  it("combine creates a linked mixed source with sub-method copies (GWT-9.1, R-172/R-173)", () => {
    const { s, nodeId } = openWithTwoMethods();
    const [obs, survey] = pool();
    s().combineMethods(nodeId, [obs!.id, survey!.id], {
      name: "Obs + Survey",
      type: "convergent",
      explanation: "Findings are triangulated across both.",
    });
    const source = pool().find((m) => m.name === "Obs + Survey")!;
    expect(source.isMixedMethodsSource).toBe(true);
    expect(source.mixedMethodsType).toBe("convergent"); // once, on the source (GWT-9.5, Q28)
    expect(source.memberSubMethods).toHaveLength(2);
    expect(source.memberSubMethods!.every((sub) => sub.retainedAtEvidenceTier)).toBe(true);
    expect(
      source.memberSubMethods!.every((sub) => sub.mixedMethodsSourceId === source.id),
    ).toBe(true);
    // linked to the node at the evidence tier, fit justification empty (⚠Q39)
    const link = node().evidenceLinks.find((l) => l.evidenceMethodId === source.id);
    expect(link?.fitJustification).toBe("");
    expect(checkMixedMethods(source)).toEqual([]);
  });

  it("refuses to combine <2 members or a mixed source itself (Invariant 12, ⚠Q38)", () => {
    const { s, nodeId } = openWithTwoMethods();
    const [obs, survey] = pool();
    s().combineMethods(nodeId, [obs!.id], {
      name: "One",
      type: "embedded",
      explanation: "x",
    });
    expect(pool()).toHaveLength(2); // nothing created
    s().combineMethods(nodeId, [obs!.id, survey!.id], {
      name: "Mix",
      type: "embedded",
      explanation: "x",
    });
    const mix = pool().find((m) => m.name === "Mix")!;
    s().combineMethods(nodeId, [mix.id, obs!.id], {
      name: "Nested",
      type: "embedded",
      explanation: "x",
    });
    expect(pool().find((m) => m.name === "Nested")).toBeUndefined();
  });

  it("not-retained sub-methods leave the node's tier; re-retaining re-links (GWT-9.2, Q27/⚠Q38)", () => {
    const { s, nodeId } = openWithTwoMethods();
    const [obs, survey] = pool();
    s().chooseEvidenceTier(nodeId, "list");
    s().setDataDescription(nodeId, obs!.id, "Observation notes.");
    s().setDataDescription(nodeId, survey!.id, "Survey results.");
    s().combineMethods(nodeId, [obs!.id, survey!.id], {
      name: "Mix",
      type: "convergent",
      explanation: "Triangulated.",
    });
    const source = () => pool().find((m) => m.name === "Mix")!;
    const sub = () => source().memberSubMethods!.find((x) => x.sourceMethodId === obs!.id)!;

    s().setSubMethodRetention(nodeId, sub().id, false);
    expect(sub().retainedAtEvidenceTier).toBe(false);
    expect(node().evidenceLinks.some((l) => l.evidenceMethodId === obs!.id)).toBe(false);
    // its stale tier entry went to the RecycleBin with the link (⚠Q38)
    const tier = node().evidenceTier;
    expect(
      tier?.shape === "list" && tier.entries.some((e) => e.evidenceMethodId === obs!.id),
    ).toBe(false);
    // the method object stays in the pool as the sub-method's data carrier
    expect(pool().some((m) => m.id === obs!.id)).toBe(true);
    expect(checkSubMethodRetention(node(), pool())).toEqual([]); // Invariant 13

    s().setSubMethodRetention(nodeId, sub().id, true);
    const relink = node().evidenceLinks.find((l) => l.evidenceMethodId === obs!.id);
    expect(relink?.fitJustification).toBe("");
    expect(checkSubMethodRetention(node(), pool())).toEqual([]);
  });

  it("combining re-opens the evidence tier until the mixed source is described (⚠Q39, R-176)", () => {
    const { s, nodeId } = openWithTwoMethods();
    const [obs, survey] = pool();
    s().chooseEvidenceTier(nodeId, "list");
    s().setDataDescription(nodeId, obs!.id, "Observation notes.");
    s().setDataDescription(nodeId, survey!.id, "Survey results.");
    expect(evidenceIncomplete(node())).toBe(false);

    s().combineMethods(nodeId, [obs!.id, survey!.id], {
      name: "Mix",
      type: "multistage",
      explanation: "Phased.",
    });
    expect(evidenceIncomplete(node())).toBe(true); // the new source is undescribed

    const source = pool().find((m) => m.name === "Mix")!;
    s().setDataDescription(nodeId, source.id, "Combined phased findings.");
    expect(evidenceIncomplete(node())).toBe(false);
  });

  it("ticking existing methods stores type per method, a note, and no copies (GWT-9.3, R-165–R-168)", () => {
    const { s, nodeId } = openWithTwoMethods();
    const [obs] = pool();
    s().tickMethodAsMixed(obs!.id, true);
    expect(checkMixedMethods(pool()[0]!)).toHaveLength(1); // type still missing
    s().setMixedMethodsType(obs!.id, "caseStudy");
    expect(pool()[0]!.isMixedMethodsSource).toBe(true);
    expect(pool()[0]!.mixedMethodsType).toBe("caseStudy");
    expect(pool()[0]!.memberSubMethods).toBeUndefined(); // note-only, no copies
    expect(checkMixedMethods(pool()[0]!)).toEqual([]);

    s().resolveMixedMethods(nodeId, "Mixing occurs within 1 existing Evidence/Method(s) of this criterion.");
    expect(node().mixedMethodsResolved).toBe(true);
    expect(node().subMethodsNote).toContain("Mixing occurs");

    s().tickMethodAsMixed(obs!.id, false); // un-ticking clears the type fields
    expect(pool()[0]!.isMixedMethodsSource).toBe(false);
    expect(pool()[0]!.mixedMethodsType).toBeUndefined();
  });

  it("'Other' carries the user's own strategy name; another type drops it (R-166/R-167)", () => {
    const { s } = openWithTwoMethods();
    const [obs] = pool();
    s().tickMethodAsMixed(obs!.id, true);
    s().setMixedMethodsType(obs!.id, "other");
    expect(checkMixedMethods(pool()[0]!)).toHaveLength(1); // own name missing
    s().setMixedMethodsCustomName(obs!.id, "My own blend");
    expect(checkMixedMethods(pool()[0]!)).toEqual([]);
    s().setMixedMethodsType(obs!.id, "embedded");
    expect(pool()[0]!.mixedMethodsCustomName).toBeUndefined();
  });
});

describe("full-rubric review (J6, R-067)", () => {
  it("confirmRubricReview marks the layer reviewed", () => {
    const s = () => useStore.getState();
    s().createEQ("EQ");
    expect(s().doc!.mesoLayers[0]!.reviewConfirmed).toBeUndefined();
    s().confirmRubricReview();
    expect(s().doc!.mesoLayers[0]!.reviewConfirmed).toBe(true);
  });
});

describe("evalqFileName", () => {
  it("slugs the EQ title into a stable file name", () => {
    expect(evalqFileName("Reading program quality")).toBe(
      "reading-program-quality.evalq.json",
    );
    expect(evalqFileName("  ??  ")).toBe("evaluation-question.evalq.json");
  });
});

describe("connect evidence to conclusions (J10, R-083–R-097, ⚠Q41/⚠Q42)", () => {
  const s = () => useStore.getState();
  const node = () => s().doc!.mesoLayers[0]!.nodes[0]!;
  const openCell = () => node().cells.find((c) => c.included)!;

  it("adds, describes and removes scenarios; removal recycles and renumbers (R-087)", () => {
    buildSkeleton();
    const cell = openCell();
    s().addScenario(node().id, cell.id); // second box in the same cell (OR)
    const scenarios = () => node().cells.find((c) => c.id === cell.id)!.scenarios;
    expect(scenarios()).toHaveLength(2);
    expect(scenarios().map((sc) => sc.order)).toEqual([0, 1]);

    const removedId = scenarios()[0]!.id;
    s().removeScenario(node().id, cell.id, removedId);
    expect(scenarios()).toHaveLength(1);
    expect(scenarios()[0]!.order).toBe(0); // renumbered
    const bin = s().doc!.recycleBin.deletedNodes;
    expect(bin.some((d) => (d.node as { id?: string }).id === removedId)).toBe(true);
  });

  it("refuses a scenario on an excluded cell (Invariant 6)", () => {
    buildSkeleton();
    s().addNode("Second"); // keeps ≥1 open per side satisfiable
    const cell = openCell();
    s().toggleCellIncluded(node().id, cell.id);
    const excluded = node().cells.find((c) => c.id === cell.id)!;
    if (!excluded.included) {
      s().addScenario(node().id, cell.id);
      expect(node().cells.find((c) => c.id === cell.id)!.scenarios).toEqual([]);
    }
  });

  it("stores token-bearing prose; the token name resolves live (Q41, ⚠Q43)", () => {
    buildSkeleton();
    const cell = openCell();
    const scenario = () =>
      node().cells.find((c) => c.id === cell.id)!.scenarios[0]!;
    const methodId = s().doc!.evidenceMethods[0]!.id;

    s().updateScenarioParts(node().id, cell.id, scenario().id, [
      { kind: "token", targetId: methodId },
      { kind: "text", text: " shows structured lessons in 8 of 10 classes." },
    ]);
    expect(scenario().parts).toEqual([
      { kind: "token", targetId: methodId },
      { kind: "text", text: " shows structured lessons in 8 of 10 classes." },
    ]);

    // The bold name is resolved from the pool at read time — a rename never
    // strands the prose (the point of persisting the link, ⚠Q43).
    const nameFor = (id: string) =>
      s().doc!.evidenceMethods.find((m) => m.id === id)?.name ?? "(unnamed)";
    expect(scenarioPlainText(scenario().parts, nameFor)).toBe(
      "Classroom observation shows structured lessons in 8 of 10 classes.",
    );
    s().updateEvidenceMethod(methodId, "name", "Lesson observation");
    expect(scenarioPlainText(scenario().parts, nameFor)).toBe(
      "Lesson observation shows structured lessons in 8 of 10 classes.",
    );
  });

  it("drops a token that names no pooled Evidence/Method, keeping the text (⚠Q43)", () => {
    buildSkeleton();
    const cell = openCell();
    const scenario = () =>
      node().cells.find((c) => c.id === cell.id)!.scenarios[0]!;

    s().updateScenarioParts(node().id, cell.id, scenario().id, [
      { kind: "text", text: "Kept prose." },
      { kind: "token", targetId: crypto.randomUUID() }, // not in the pool
    ]);
    expect(scenario().parts).toEqual([{ kind: "text", text: "Kept prose." }]);
  });

  it("a token alone is not a described Scenario — the R-097 gate wants typed prose (⚠Q43)", () => {
    buildSkeleton();
    const cell = openCell();
    const scenario = () =>
      node().cells.find((c) => c.id === cell.id)!.scenarios[0]!;
    const methodId = s().doc!.evidenceMethods[0]!.id;

    s().updateScenarioParts(node().id, cell.id, scenario().id, [
      { kind: "token", targetId: methodId },
    ]);
    expect(scenarioDescribed(scenario())).toBe(false);
    expect(checkScenariosComplete(node()).length).toBeGreaterThan(0);

    s().updateScenarioParts(node().id, cell.id, scenario().id, [
      { kind: "token", targetId: methodId },
      { kind: "text", text: " confirms it in every class." },
    ]);
    expect(scenarioDescribed(scenario())).toBe(true);
    expect(checkScenariosComplete(node())).toEqual([]);
  });

  it("clarity rating is 1–5; 4–5 drops a stale decline note (Q8/Q9, R-093/R-096)", () => {
    buildSkeleton();
    const cell = () => node().cells.find((c) => c.included)!;
    s().setCellClarity(node().id, cell().id, 6);
    expect(cell().clarityRating).toBeUndefined();

    s().setCellClarity(node().id, cell().id, 2);
    expect(cell().clarityRating).toBe(2);
    s().setCellClarityNote(
      node().id,
      cell().id,
      "Evidence may not provide confident clarity for this conclusion.",
    );
    expect(cell().clarityNote).toContain("confident clarity");

    s().setCellClarity(node().id, cell().id, 5);
    expect(cell().clarityRating).toBe(5);
    expect(cell().clarityNote).toBeUndefined(); // stale note dropped
  });

  it("add-evidence re-entry routes to evidence planning and hands back to connect (R-094/R-095)", () => {
    buildSkeleton();
    s().beginEvidenceReentry(node().id);
    expect(s().view).toBe("evidence");
    expect(s().focusNodeId).toBe(node().id);
    expect(s().evidenceReturnTo).toBe("connect");
  });
});

describe("Overall Judgement synthesis (J11, R-098–R-112, ⚠Q44/⚠Q45/⚠Q46)", () => {
  const s = () => useStore.getState();
  const judgement = () => s().doc!.overallJudgement!;

  /** An EQ with highlighted value language, at the synthesis choice. */
  function buildToSynthesis() {
    s().createEQ("EQ");
    s().setQuestionText("How effective and equitable is the program?");
    s().addValueSpan(4, 13, "effective");
    s().addValueSpan(18, 27, "equitable");
  }

  it("accepting creates a 2+2 continuum seeded from the value language (R-100/R-101, GWT-11.2)", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    const { columns, sufficientBarAfterOrdinal } = judgement().continuum;
    expect(columns).toHaveLength(4);
    expect(sufficientBarAfterOrdinal).toBe(2); // two each side (R-101)
    // Q34 seeding pattern: value language fills positive-side headers bar-outward
    expect(columns.filter((c) => c.ordinal > 2).map((c) => c.label)).toEqual([
      "effective",
      "equitable",
    ]);
    expect(columns.filter((c) => c.ordinal <= 2).map((c) => c.label)).toEqual(["", ""]);
    expect(judgement().decisionRowEnabled).toBe(true);
    expect(s().doc!.synthesisDeclined).toBeUndefined();
  });

  it("declining records the choice and recycles a built rubric; re-accepting keeps work (Q5/Q20)", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    const builtId = judgement().id;
    s().setJudgementColumnLabel(judgement().continuum.columns[0]!.id, "Poor");
    s().acceptSynthesis(); // idempotent — existing work kept
    expect(judgement().id).toBe(builtId);

    s().declineSynthesis();
    expect(s().doc!.synthesisDeclined).toBe(true);
    expect(s().doc!.overallJudgement).toBeUndefined();
    const bin = s().doc!.recycleBin.deletedNodes;
    expect(bin.some((d) => (d.node as { id?: string }).id === builtId)).toBe(true);

    s().acceptSynthesis(); // changed their mind — a fresh rubric, decline cleared
    expect(s().doc!.synthesisDeclined).toBeUndefined();
    expect(judgement().id).not.toBe(builtId);
  });

  it("column ops hold ≥1 per side; removal drops cells and recycles that column's scenarios", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    const columns = () => judgement().continuum.columns;
    const negatives = () => columns().filter((c) => c.ordinal <= judgement().continuum.sufficientBarAfterOrdinal);

    const target = negatives()[0]!;
    s().setDecisionCellText(target.id, "No-go.");
    s().setJudgementPlainDescription(target.id, "Not acceptable.");
    s().addJudgementScenario(target.id);
    expect(judgement().scenarios).toHaveLength(1);

    s().removeJudgementColumn(target.id);
    expect(columns()).toHaveLength(3);
    expect(judgement().decisionCells).toEqual([]);
    expect(judgement().plainDescriptionCells).toEqual([]);
    expect(judgement().scenarios).toEqual([]);
    expect(
      s().doc!.recycleBin.deletedNodes.some(
        (d) => d.originPath === "overallJudgement/scenarios",
      ),
    ).toBe(true);

    // ≥1 per side: the last negative column cannot be removed (R-158/Q7)
    const lastNegative = negatives()[0]!;
    s().removeJudgementColumn(lastNegative.id);
    expect(columns()).toHaveLength(3);
  });

  it("the Decision row toggles off without losing its text (R-102, ⚠Q46)", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    const column = judgement().continuum.columns[3]!;
    s().setDecisionCellText(column.id, "Recommend contract renewal.");

    s().toggleDecisionRow();
    expect(judgement().decisionRowEnabled).toBe(false);
    expect(judgement().decisionCells[0]!.text).toBe("Recommend contract renewal.");
    // while hidden the row is not editable
    s().setDecisionCellText(column.id, "changed");
    expect(judgement().decisionCells[0]!.text).toBe("Recommend contract renewal.");

    s().toggleDecisionRow();
    expect(judgement().decisionRowEnabled).toBe(true);
  });

  it("judgement scenarios carry node tokens and collective parts; foreign tokens drop (⚠Q44)", () => {
    buildToSynthesis();
    const layer = () => s().doc!.mesoLayers[0]!;
    s().addNode("Teaching quality");
    const nodeId = layer().nodes[0]!.id;
    s().acceptSynthesis();
    const column = judgement().continuum.columns[3]!;
    s().addJudgementScenario(column.id);
    const scenario = () => judgement().scenarios[0]!;
    expect(scenario().yieldsColumnId).toBe(column.id);

    s().updateJudgementScenarioParts(scenario().id, [
      { kind: "token", targetId: nodeId },
      { kind: "text", text: " reaches its top column, and " },
      { kind: "collective", label: "all other criteria" },
      { kind: "text", text: " clear the bar." },
      { kind: "token", targetId: crypto.randomUUID() }, // no such meso node
    ]);
    expect(scenario().parts).toEqual([
      { kind: "token", targetId: nodeId },
      { kind: "text", text: " reaches its top column, and " },
      { kind: "collective", label: "all other criteria" },
      { kind: "text", text: " clear the bar." },
    ]);
    expect(
      scenarioPlainText(scenario().parts, (id) =>
        layer().nodes.find((n) => n.id === id)?.name ?? "(unnamed)",
      ),
    ).toBe(
      "Teaching quality reaches its top column, and all other criteria clear the bar.",
    );

    s().removeJudgementScenario(scenario().id);
    expect(judgement().scenarios).toEqual([]);
  });

  it("a clicked cell's token carries the column and reads '«name» is «header»' (Q44 redirect, 2026-07-14)", () => {
    buildToSynthesis();
    const layer = () => s().doc!.mesoLayers[0]!;
    s().addNode("Teaching quality");
    const nodeId = layer().nodes[0]!.id;
    s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
    s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
    const mesoColumn = layer().continuum.columns[1]!;
    s().acceptSynthesis();
    const column = judgement().continuum.columns[3]!;
    s().addJudgementScenario(column.id);
    const scenario = () => judgement().scenarios[0]!;

    s().updateJudgementScenarioParts(scenario().id, [
      { kind: "token", targetId: nodeId, atColumnId: mesoColumn.id },
      { kind: "text", text: " or above, and the rest clear the bar." },
    ]);
    // atColumnId survives the pool-guarded write-back and the canonical schema
    expect(scenario().parts[0]).toEqual({
      kind: "token",
      targetId: nodeId,
      atColumnId: mesoColumn.id,
    });
    const parsed = evaluationQuestionSchema.parse(JSON.parse(JSON.stringify(s().doc)));
    expect(parsed.overallJudgement?.scenarios[0]?.parts[0]).toMatchObject({
      atColumnId: mesoColumn.id,
    });
    expect(
      scenarioPlainText(
        scenario().parts,
        (id) => layer().nodes.find((n) => n.id === id)?.name ?? "(unnamed)",
        (columnId) =>
          layer().continuum.columns.find((c) => c.id === columnId)?.label ?? "(removed)",
      ),
    ).toBe("Teaching quality is Sufficient or above, and the rest clear the bar.");
  });

  it("the synthesis gate: headers + plain descriptions, or the R-112 free text (⚠Q45)", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    expect(checkSynthesisComplete(s().doc!).length).toBeGreaterThan(0);

    for (const column of judgement().continuum.columns) {
      s().setJudgementColumnLabel(column.id, `Level ${column.ordinal}`);
    }
    expect(checkSynthesisComplete(s().doc!).length).toBeGreaterThan(0); // plain missing

    s().setSynthesisFreeText("Overall: sufficient when everything clears the bar.");
    expect(checkSynthesisComplete(s().doc!)).toEqual([]); // escape hatch

    s().setSynthesisFreeText("  ");
    expect(checkSynthesisComplete(s().doc!).length).toBeGreaterThan(0);

    for (const column of judgement().continuum.columns) {
      s().setJudgementPlainDescription(column.id, "Judgement here.");
    }
    expect(checkSynthesisComplete(s().doc!)).toEqual([]);
  });

  it("a doc with a fulfilled synthesis round-trips the canonical schema", () => {
    buildToSynthesis();
    s().acceptSynthesis();
    for (const column of judgement().continuum.columns) {
      s().setJudgementColumnLabel(column.id, `Level ${column.ordinal}`);
      s().setJudgementPlainDescription(column.id, "Judgement here.");
    }
    const parsed = evaluationQuestionSchema.parse(
      JSON.parse(JSON.stringify(s().doc)),
    );
    expect(parsed.overallJudgement?.plainDescriptionCells).toHaveLength(4);
  });

  it("setCellCondition saves a condition, stamps lastModified, and round-trips (Slice 13)", () => {
    buildSkeleton();
    const node = () => s().doc!.mesoLayers[0]!.nodes[0]!;
    const cell = node().cells[0]!;
    s().setCellCondition(node().id, cell.id, {
      mode: "boolean",
      booleanLogic: {
        root: {
          type: "TERM",
          term: {
            evidenceElementId: s().doc!.evidenceMethods[0]!.id,
            evidenceElementLabel: "[Classroom observation]",
            comparator: "is",
            value: "Strong",
            valueLabel: "Strong",
          },
        },
        plainEnglish: "[Classroom observation] is Strong",
      },
      lastModified: "1970-01-01T00:00:00.000Z",
    });
    const saved = s().doc!.mesoLayers[0]!.nodes[0]!.cells[0]!.condition!;
    expect(saved.mode).toBe("boolean");
    expect(saved.booleanLogic?.plainEnglish).toBe("[Classroom observation] is Strong");
    // The store stamps its own lastModified, overriding whatever was passed.
    expect(saved.lastModified).not.toBe("1970-01-01T00:00:00.000Z");
    // The whole document still satisfies the canonical schema.
    expect(() =>
      evaluationQuestionSchema.parse(JSON.parse(JSON.stringify(s().doc))),
    ).not.toThrow();
  });
});
