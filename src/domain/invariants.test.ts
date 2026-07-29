import { describe, expect, it } from "vitest";
import {
  createDataDescriptionList,
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createMesoNode,
  createMinimalContinuum,
  createMixedMethodsSource,
  createScenario,
} from "./factory";
import {
  checkCellContent,
  checkColumnHeaders,
  checkContinuum,
  checkDistinguishingCase,
  checkDocument,
  checkEvidenceTier,
  checkMixedMethods,
  checkNodeCells,
  checkNodeList,
  checkPlainDescriptionsComplete,
  checkScenariosComplete,
  checkSimCaseAdvisory,
  checkSubMethodRetention,
  checkUniqueIds,
  checkWarrantCompleteness,
} from "./invariants";

describe("Invariant 3 [gate] + 4 [report] — continuum shape", () => {
  it("passes a minimal 1+1 continuum around the bar", () => {
    expect(checkContinuum(createMinimalContinuum())).toEqual([]);
  });

  it("gates when a side of the Sufficient Bar is empty (Q7)", () => {
    const continuum = createMinimalContinuum();
    continuum.sufficientBarAfterOrdinal = 2; // both columns now negative
    const issues = checkContinuum(continuum);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ invariant: 3, mode: "gate" });
  });

  it("reports (never blocks) duplicate ordinals", () => {
    const continuum = createMinimalContinuum();
    continuum.columns[1]!.ordinal = continuum.columns[0]!.ordinal;
    const modes = checkContinuum(continuum).map((i) => `${i.invariant}:${i.mode}`);
    expect(modes).toContain("4:report");
  });

  it("gates on blank Column Headers (R-042)", () => {
    const continuum = createMinimalContinuum();
    expect(checkColumnHeaders(continuum)).toHaveLength(1);
    continuum.columns[0]!.label = "Insufficient";
    continuum.columns[1]!.label = "Sufficient";
    expect(checkColumnHeaders(continuum)).toEqual([]);
  });
});

describe("Node-list step gate — ≥1 named node (R-153, ⚠Q35)", () => {
  it("gates an empty list, gates unnamed nodes, passes named ones", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    expect(checkNodeList(layer)).toHaveLength(1);
    layer.nodes.push(createMesoNode(layer));
    expect(checkNodeList(layer)).toHaveLength(1);
    layer.nodes[0]!.name = "Teaching quality";
    expect(checkNodeList(layer)).toEqual([]);
  });

  it("does not gate on the three link fields (⚠Q35 provisional)", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    layer.nodes.push(createMesoNode(layer, "Named"));
    // linkToQuestion/linkToValues/decisionsOrUse are all empty:
    expect(checkNodeList(layer)).toEqual([]);
  });
});

describe("Invariant 5 [gate] — one cell per column, no opt-out", () => {
  it("passes a factory-created node and gates when a cell is missing", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    expect(checkNodeCells(node, layer.continuum)).toEqual([]);
    node.cells.pop();
    expect(checkNodeCells(node, layer.continuum)[0]).toMatchObject({
      invariant: 5,
      mode: "gate",
    });
  });
});

describe("Invariant 6 [gate] — excluded cells carry no content", () => {
  it("gates when a greyed-out cell still has a Plain Description", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    const cell = node.cells[0]!;
    cell.included = false;
    expect(checkCellContent(node)).toEqual([]);
    cell.plainDescription = "leftover text";
    expect(checkCellContent(node)[0]).toMatchObject({ invariant: 6, mode: "gate" });
  });
});

describe("Invariant 7 [gate] — every open cell described before the step completes", () => {
  it("gates while an included cell is empty; excluded cells are not required", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    expect(checkPlainDescriptionsComplete(node)[0]).toMatchObject({
      invariant: 7,
      mode: "gate",
    });
    node.cells[0]!.plainDescription = "Below the bar this looks like…";
    node.cells[1]!.included = false;
    expect(checkPlainDescriptionsComplete(node)).toEqual([]);
  });
});

describe("Invariant 8 [gate] — mandatory evidence tier + ≥1 Evidence/Method", () => {
  it("gates on a missing tier and a missing link, passes when both exist", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    expect(checkEvidenceTier(node)).toHaveLength(2);
    const method = createEvidenceMethod("Survey");
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, "Fits because…"));
    node.evidenceTier = createDataDescriptionList(node.id);
    expect(checkEvidenceTier(node)).toEqual([]);
  });
});

describe("Invariant 12 [gate] — combined mixed-methods source shape", () => {
  it("gates <2 members, then missing type, 'other' name and explanation in turn", () => {
    const one = createMixedMethodsSource("Mix", [crypto.randomUUID()]);
    expect(checkMixedMethods(one).some((i) => i.invariant === 12 && i.mode === "gate")).toBe(
      true,
    );

    const source = createMixedMethodsSource("Mix", [
      crypto.randomUUID(),
      crypto.randomUUID(),
    ]);
    expect(checkMixedMethods(source)).toHaveLength(2); // type + explanation
    source.mixedMethodsType = "other";
    expect(checkMixedMethods(source)).toHaveLength(2); // own name + explanation
    source.mixedMethodsCustomName = "My blend";
    source.mixedMethodsExplanation = "Why these mix.";
    expect(checkMixedMethods(source)).toEqual([]);
  });

  it("a ticked existing method needs only its type (R-165/R-166); plain methods pass", () => {
    const method = createEvidenceMethod("Survey");
    expect(checkMixedMethods(method)).toEqual([]);
    method.isMixedMethodsSource = true; // ticked as already-mixed, no member copies
    expect(checkMixedMethods(method)).toHaveLength(1);
    method.mixedMethodsType = "caseStudy";
    expect(checkMixedMethods(method)).toEqual([]);
  });
});

describe("R-097 step gate — every open cell has a described Scenario (Invariant 11's predicate)", () => {
  it("gates open cells without scenarios, ignores excluded cells and blank prose", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    layer.nodes.push(node);
    // Both cells open, no scenarios → one gate naming both cells
    const issues = checkScenariosComplete(node);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ invariant: 11, mode: "gate" });
    expect(issues[0]!.message).toContain("2 open conclusion(s)");

    // A blank scenario is not a described one (R-097)
    node.cells[0]!.scenarios.push(createScenario(0));
    expect(checkScenariosComplete(node)[0]!.message).toContain("2 open conclusion(s)");

    // …and neither is an inserted token with no typed prose around it (⚠Q43)
    node.cells[0]!.scenarios[0]!.parts = [
      { kind: "token", targetId: crypto.randomUUID() },
      { kind: "text", text: "  " },
    ];
    expect(checkScenariosComplete(node)[0]!.message).toContain("2 open conclusion(s)");

    node.cells[0]!.scenarios[0]!.parts = [
      { kind: "text", text: "Observation notes show disengagement." },
    ];
    expect(checkScenariosComplete(node)[0]!.message).toContain("1 open conclusion(s)");

    // Excluding the other cell removes it from the requirement (Invariant 6)
    node.cells[1]!.included = false;
    node.cells[1]!.scenarios = [];
    expect(checkScenariosComplete(node)).toEqual([]);
  });
});

describe("Invariant 13 [report] — sub-method retention agrees with the node's links", () => {
  it("reports when the stored flag and the evidence links disagree", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    layer.nodes.push(node);
    const a = createEvidenceMethod("Observation");
    const b = createEvidenceMethod("Survey");
    const source = createMixedMethodsSource("Mix", [a.id, b.id]);
    doc.evidenceMethods.push(a, b, source);
    node.evidenceLinks.push(
      createEvidenceLink(a.id, node.id, "Fits."),
      createEvidenceLink(b.id, node.id, "Fits."),
      createEvidenceLink(source.id, node.id, ""),
    );
    expect(checkSubMethodRetention(node, doc.evidenceMethods)).toEqual([]);

    // marked sub-methods-only but still linked at the tier → disagreement
    source.memberSubMethods![0]!.retainedAtEvidenceTier = false;
    const issues = checkSubMethodRetention(node, doc.evidenceMethods);
    expect(issues[0]).toMatchObject({ invariant: 13, mode: "report" });

    // resolving the link brings them back into agreement
    node.evidenceLinks = node.evidenceLinks.filter((l) => l.evidenceMethodId !== a.id);
    expect(checkSubMethodRetention(node, doc.evidenceMethods)).toEqual([]);
  });
});

describe("Invariant 1 [report] — UUIDs assigned once, never reused", () => {
  it("reports duplicated ids across the document", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    expect(checkUniqueIds(doc)).toEqual([]);
    layer.continuum.columns[1]!.id = layer.continuum.columns[0]!.id;
    expect(checkUniqueIds(doc)[0]).toMatchObject({ invariant: 1, mode: "report" });
  });
});

describe("Invariant 21 [report] (V2, Q63) — cell-condition warrant completeness", () => {
  it("reports a warrant with type: null (the migrated-legacy state)", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    node.cells[0]!.condition = {
      mode: "prose",
      lastModified: new Date().toISOString(),
      warrant: { type: null, source: "", text: "Migrated text." },
    };
    expect(checkWarrantCompleteness(node)).toEqual([
      { invariant: 21, mode: "report", message: expect.stringContaining("missing a type or a source") },
    ]);
  });

  it("reports a typed warrant with an empty source (authority is not exempt, Q63)", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    node.cells[0]!.condition = {
      mode: "prose",
      lastModified: new Date().toISOString(),
      warrant: { type: "authority", source: "", text: "Because mandated." },
    };
    expect(checkWarrantCompleteness(node)).toHaveLength(1);
  });

  it("is silent when every warrant has both a type and a non-empty source", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    node.cells[0]!.condition = {
      mode: "prose",
      lastModified: new Date().toISOString(),
      warrant: { type: "expert", source: "Head of teaching", text: "Because expertise." },
    };
    expect(checkWarrantCompleteness(node)).toEqual([]);
  });

  it("is silent when a cell carries no warrant at all — absence is not incompleteness", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    expect(checkWarrantCompleteness(node)).toEqual([]);
  });
});

describe("Invariant 22 [report] (V2, extension spec §3.2) — distinguishing case advisory", () => {
  it("advises once when no cell of the node names a distinguishing case", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    expect(checkDistinguishingCase(node)).toEqual([
      { invariant: 22, mode: "report", message: expect.stringContaining("no distinguishing case") },
    ]);
  });

  it("is silent once at least one cell names a distinguishing case", () => {
    const layer = createMinimalContinuum();
    const node = createMesoNode({ id: "l", kind: "criteria", tierOrder: 0, continuum: layer, nodes: [] }, "Quality");
    node.cells[0]!.distinguishingCase = "Stops short of the next column.";
    expect(checkDistinguishingCase(node)).toEqual([]);
  });
});

describe("Invariant 23 [report] (V2 Phase 2, extension spec §5.1) — SimCase advisory", () => {
  it("is silent when there are no cases at all", () => {
    const doc = createEvaluationQuestion("EQ");
    expect(checkSimCaseAdvisory(doc)).toEqual([]);
  });

  it("advises when a non-empty case set has no case marked expectedToFail", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.simCases = [{ id: "c1", label: "A", prose: "", values: {} }];
    expect(checkSimCaseAdvisory(doc)).toEqual([
      { invariant: 23, mode: "report", message: expect.stringContaining("expected to fail") },
    ]);
  });

  it("is silent once at least one case is marked expectedToFail", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.simCases = [
      { id: "c1", label: "A", prose: "", values: {} },
      { id: "c2", label: "B", prose: "", values: {}, expectedToFail: true },
    ];
    expect(checkSimCaseAdvisory(doc)).toEqual([]);
  });
});

describe("checkDocument — whole-document readiness", () => {
  it("lists gates for a fresh document and none for a complete skeleton", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.questionText = "How good is it?";
    const layer = doc.mesoLayers[0]!;
    layer.continuum.columns[0]!.label = "Insufficient";
    layer.continuum.columns[1]!.label = "Sufficient";
    const node = createMesoNode(layer, "Quality");
    layer.nodes.push(node);
    expect(checkDocument(doc).some((i) => i.mode === "gate")).toBe(true);

    for (const cell of node.cells) cell.plainDescription = "Described.";
    const method = createEvidenceMethod("Survey");
    doc.evidenceMethods.push(method);
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, "Fits."));
    const list = createDataDescriptionList(node.id);
    list.entries.push({ evidenceMethodId: method.id, description: "Survey results." });
    node.evidenceTier = list;
    // Open cells still lack their Evidence-row scenarios (R-097)
    expect(checkDocument(doc).some((i) => i.invariant === 11)).toBe(true);

    for (const cell of node.cells) {
      const scenario = createScenario(0);
      scenario.parts = [{ kind: "text", text: "Survey scores land here." }];
      cell.scenarios.push(scenario);
    }
    // V2 (Invariant 22): a genuinely complete framework names a
    // distinguishing case somewhere on the node, not on every cell.
    node.cells[0]!.distinguishingCase = "Only reaches this far, not further.";
    expect(checkDocument(doc)).toEqual([]);
  });
});
