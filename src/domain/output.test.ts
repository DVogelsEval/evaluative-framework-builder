import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { subordinateLayer, superiorLayer } from "./layers";
import {
  clarityNotes,
  columnsByBar,
  conditionSummary,
  evidenceMatrix,
  justificationsByCriterion,
  matrixToCsv,
  methodOutputLabel,
  orderedNodesForOutput,
  SUFFICIENT_BAR_MARKER,
  toMarkdown,
} from "./output";
import type { EvaluationQuestion } from "./schema";

beforeEach(() => {
  useStore.setState({
    project: null,
    doc: null,
    view: "start",
    focusNodeId: null,
    evidenceReturnTo: null,
  });
});

const s = () => useStore.getState();
const doc = (): EvaluationQuestion => s().doc!;
const layer = () => subordinateLayer(doc())!;

/** A single-criterion framework with two Evidence/Methods on the criterion. */
function buildTwoMethodNode() {
  s().createEQ("Reading program quality");
  s().setQuestionText("How good is the reading program?");
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
  s().addNode("Teaching quality");
  const nodeId = layer().nodes[0]!.id;
  s().addEvidenceMethod(nodeId, {
    name: "Classroom observation",
    whatWillBeDone: "Observe ten lessons.",
    fitJustification: "Observes teaching directly.",
  });
  s().addEvidenceMethod(nodeId, {
    name: "Pupil survey",
    whatWillBeDone: "Survey the pupils.",
    fitJustification: "Captures pupil experience.",
  });
  return nodeId;
}

describe("conditionSummary + Markdown conditions (Slice 13, R-COND-12)", () => {
  it("summarises a boolean condition as its plain English with qualifiers", () => {
    expect(
      conditionSummary({
        mode: "boolean",
        booleanLogic: {
          root: { type: "TERM", term: {
            evidenceElementId: "m", evidenceElementLabel: "[Method A]",
            comparator: "is", value: "Strong", valueLabel: "Strong",
          } },
          plainEnglish: "[Method A] is Strong",
        },
        warrant: "Strong teaching is the core signal.",
        lastModified: "2026-07-24T00:00:00.000Z",
      }),
    ).toBe("[Method A] is Strong; rationale: Strong teaching is the core signal.");
  });

  it("summarises a prose condition and returns '' for an empty one", () => {
    expect(
      conditionSummary({ mode: "prose", proseDescription: "When it converges.", lastModified: "2026-07-24T00:00:00.000Z" }),
    ).toBe("When it converges.");
    expect(conditionSummary({ mode: "prose", lastModified: "2026-07-24T00:00:00.000Z" })).toBe("");
    expect(conditionSummary(undefined)).toBe("");
  });

  it("emits a cell's condition beneath its conclusion in the Markdown output", () => {
    const nodeId = buildTwoMethodNode();
    const node = layer().nodes[0]!;
    const openCell = node.cells.find((c) => c.included)!;
    s().setCellCondition(nodeId, openCell.id, {
      mode: "boolean",
      booleanLogic: {
        root: { type: "TERM", term: {
          evidenceElementId: doc().evidenceMethods[0]!.id,
          evidenceElementLabel: "[Classroom observation]",
          comparator: "is", value: "Strong", valueLabel: "Strong",
        } },
        plainEnglish: "[Classroom observation] is Strong",
      },
      lastModified: "2026-07-24T00:00:00.000Z",
    });
    const md = toMarkdown(doc());
    expect(md).toContain("_Condition:_ [Classroom observation] is Strong");
  });
});

describe("evidenceMatrix (R-116, Q26)", () => {
  it("rows = methods, columns = subordinate nodes, marked where linked", () => {
    const nodeId = buildTwoMethodNode();
    const matrix = evidenceMatrix(doc());
    expect(matrix.columns.map((c) => c.name)).toEqual(["Teaching quality"]);
    expect(matrix.rows.map((r) => r.label)).toEqual([
      "Classroom observation",
      "Pupil survey",
    ]);
    expect(matrix.rows[0]!.process).toBe("Observe ten lessons.");
    expect(matrix.rows[0]!.markedNodeIds).toEqual([nodeId]);
  });

  it("brackets a combined mixed-methods source's sub-methods (GWT-12.2)", () => {
    const nodeId = buildTwoMethodNode();
    const [m1, m2] = doc().evidenceMethods;
    s().combineMethods(nodeId, [m1!.id, m2!.id], {
      name: "Mixed picture",
      type: "convergent",
      explanation: "Triangulate the two.",
    });
    const matrix = evidenceMatrix(doc());
    const combinedRow = matrix.rows.find((r) => r.label.startsWith("Mixed picture"));
    expect(combinedRow).toBeDefined();
    expect(combinedRow!.label).toBe(
      "Mixed picture (Classroom observation + Pupil survey)",
    );
    // The mixed source's process falls back to its strategy explanation.
    expect(combinedRow!.process).toBe("Triangulate the two.");
  });

  it("drops a not-retained sub-method from its own row but keeps it in brackets (Q38)", () => {
    const nodeId = buildTwoMethodNode();
    const [m1, m2] = doc().evidenceMethods;
    s().combineMethods(nodeId, [m1!.id, m2!.id], {
      name: "Mixed picture",
      type: "convergent",
      explanation: "Triangulate.",
    });
    // Un-retain the survey's sub-method → its link is removed from the node.
    const sub = doc()
      .evidenceMethods.flatMap((m) => m.memberSubMethods ?? [])
      .find((x) => x.sourceMethodId === m2!.id)!;
    s().setSubMethodRetention(nodeId, sub.id, false);

    const matrix = evidenceMatrix(doc());
    // Pupil survey no longer has its own row…
    expect(matrix.rows.some((r) => r.label === "Pupil survey")).toBe(false);
    // …but survives in the combined source's brackets.
    expect(
      matrix.rows.some((r) => r.label.includes("Pupil survey")),
    ).toBe(true);
  });

  it("merges dedupe-linked methods into one row with unioned marks (R-082)", () => {
    const nodeId = buildTwoMethodNode();
    const [m1, m2] = doc().evidenceMethods;
    s().linkMethodsAsSame(m1!.id, m2!.id);
    const matrix = evidenceMatrix(doc());
    expect(matrix.rows.length).toBe(1);
    expect(matrix.rows[0]!.label).toBe("Classroom observation"); // earliest in pool
    expect(matrix.rows[0]!.markedNodeIds).toEqual([nodeId]);
  });

  it("uses the subordinate layer's nodes as columns in a two-layer framework (Q33)", () => {
    buildTwoMethodNode();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const matrix = evidenceMatrix(doc());
    // Columns are the evidence-bearing (subordinate) nodes, not the components.
    expect(matrix.columns.map((c) => c.name)).toEqual(["Teaching quality"]);
    expect(superiorLayer(doc())!.nodes[0]!.name).toBe("Delivery");
  });
});

describe("justificationsByCriterion (R-117, Q51)", () => {
  it("groups methods under the criterion, carrying its warrant boxes", () => {
    const nodeId = buildTwoMethodNode();
    s().updateNodeField(nodeId, "linkToQuestion", "Central to the program's quality.");
    s().updateNodeField(nodeId, "linkToValues", "Reflects our value of engagement.");
    s().updateNodeField(nodeId, "decisionsOrUse", "Informs the renewal decision.");
    const groups = justificationsByCriterion(doc());
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.nodeName).toBe("Teaching quality");
    expect(g.linkToQuestion).toBe("Central to the program's quality.");
    expect(g.linkToValues).toBe("Reflects our value of engagement.");
    expect(g.decisionsOrUse).toBe("Informs the renewal decision.");
    expect(g.entries.map((e) => e.methodLabel)).toEqual([
      "Classroom observation",
      "Pupil survey",
    ]);
    expect(g.entries[0]!.justification).toBe("Observes teaching directly.");
    // A plain method carries no mixed-methods strategy.
    expect(g.entries[0]!.mixedStrategy).toBeUndefined();
  });

  it("surfaces a combined source's mixed-methods strategy (Q51 orphaned-data audit)", () => {
    const nodeId = buildTwoMethodNode();
    const [m1, m2] = doc().evidenceMethods;
    s().combineMethods(nodeId, [m1!.id, m2!.id], {
      name: "Mixed picture",
      type: "convergent",
      explanation: "Triangulate the two.",
    });
    const combined = justificationsByCriterion(doc())[0]!.entries.find((e) =>
      e.methodLabel.startsWith("Mixed picture"),
    );
    expect(combined?.mixedStrategy).toBe("Convergent");
  });

  it("carries the sub-methods note (R-168, Q51 audit)", () => {
    const nodeId = buildTwoMethodNode();
    s().resolveMixedMethods(nodeId, "Mixing occurs within one existing source.");
    expect(justificationsByCriterion(doc())[0]!.subMethodsNote).toBe(
      "Mixing occurs within one existing source.",
    );
  });
});

describe("columnsByBar (Q51 note 2)", () => {
  it("splits a continuum's columns into below- and above-bar groups", () => {
    buildTwoMethodNode();
    const { below, above } = columnsByBar(layer().continuum);
    expect(below.map((c) => c.label)).toEqual(["Insufficient"]);
    expect(above.map((c) => c.label)).toEqual(["Sufficient"]);
  });

  it("honours a keep filter (only included conclusions)", () => {
    buildTwoMethodNode();
    const only = columnsByBar(layer().continuum, (c) => c.label === "Sufficient");
    expect(only.below).toEqual([]);
    expect(only.above.map((c) => c.label)).toEqual(["Sufficient"]);
  });
});

describe("matrixToCsv (R-118)", () => {
  it("emits a header row and one row per method with X marks", () => {
    buildTwoMethodNode();
    const csv = matrixToCsv(evidenceMatrix(doc()));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Evidence / Method,Process,Teaching quality");
    expect(lines[1]).toBe("Classroom observation,Observe ten lessons.,X");
  });

  it("quotes fields containing commas", () => {
    s().createEQ("EQ");
    s().addNode("A, with comma");
    const csv = matrixToCsv(evidenceMatrix(doc()));
    expect(csv.split("\r\n")[0]).toContain('"A, with comma"');
  });
});

describe("orderedNodesForOutput (R-123)", () => {
  it("orders all components before all criteria", () => {
    buildTwoMethodNode(); // subordinate = criteria
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const ordered = orderedNodesForOutput(doc());
    expect(ordered.map((o) => o.layer.kind)).toEqual(["components", "criteria"]);
    expect(ordered.map((o) => o.node.name)).toEqual(["Delivery", "Teaching quality"]);
  });
});

describe("methodOutputLabel (Q26)", () => {
  it("returns the plain name for a non-mixed method", () => {
    buildTwoMethodNode();
    const method = doc().evidenceMethods[0]!;
    expect(methodOutputLabel(method, doc().evidenceMethods)).toBe("Classroom observation");
  });
});

describe("clarityNotes (R-159)", () => {
  it("surfaces recorded 'may not be clear' notes with node + column", () => {
    const nodeId = buildTwoMethodNode();
    const cellId = layer().nodes[0]!.cells[0]!.id;
    s().setCellClarityNote(nodeId, cellId, "Evidence may not provide confident clarity.");
    const notes = clarityNotes(doc());
    expect(notes).toEqual([
      {
        nodeName: "Teaching quality",
        columnLabel: "Insufficient",
        note: "Evidence may not provide confident clarity.",
      },
    ]);
  });
});

describe("toMarkdown (Q21/Q51)", () => {
  it("includes the question, an Evidence Matrix table, and the node's rubric plan", () => {
    buildTwoMethodNode();
    const md = toMarkdown(doc());
    expect(md).toContain("# Reading program quality");
    expect(md).toContain("> How good is the reading program?");
    expect(md).toContain("## Evidence Matrix");
    expect(md).toContain("| Evidence / Method | Process | Teaching quality |");
    expect(md).toContain("Classroom observation");
    expect(md).toContain("### Criterion: Teaching quality");
  });

  it("emits criterion-first justifications with warrant lines (Q51 note 1)", () => {
    const nodeId = buildTwoMethodNode();
    s().updateNodeField(nodeId, "linkToQuestion", "Central to the program's quality.");
    const md = toMarkdown(doc());
    expect(md).toContain("## Evidence justifications");
    expect(md).toContain("### Teaching quality");
    expect(md).toContain(
      "**Links to the Evaluation Question:** Central to the program's quality.",
    );
    expect(md).toContain("| Evidence / Method | Justification |");
  });

  it("draws the Sufficient Bar between below- and above-bar conclusions (Q51 note 2)", () => {
    buildTwoMethodNode();
    const md = toMarkdown(doc());
    expect(md).toContain(SUFFICIENT_BAR_MARKER);
    // The marker sits between the below- and above-bar conclusions.
    const barAt = md.indexOf(SUFFICIENT_BAR_MARKER);
    expect(md.indexOf("**Insufficient**")).toBeLessThan(barAt);
    expect(md.indexOf("**Sufficient**")).toBeGreaterThan(barAt);
  });

  it("renders components before criteria in the rubric plan (R-123)", () => {
    buildTwoMethodNode();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const md = toMarkdown(doc());
    expect(md.indexOf("### Component: Delivery")).toBeGreaterThan(-1);
    expect(md.indexOf("### Component: Delivery")).toBeLessThan(
      md.indexOf("### Criterion: Teaching quality"),
    );
  });

  it("resolves a synthesis token's column against the synthesised layer (Q44)", () => {
    buildTwoMethodNode();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const superior = superiorLayer(doc())!;
    s().setColumnLabel(superior.continuum.columns[1]!.id, "Strong");
    s().acceptSynthesis();
    const topColId = doc().overallJudgement!.continuum.columns[3]!.id;
    s().addJudgementScenario(topColId);
    const sc = doc().overallJudgement!.scenarios[0]!;
    s().updateJudgementScenarioParts(sc.id, [
      {
        kind: "token",
        targetId: superiorLayer(doc())!.nodes[0]!.id,
        atColumnId: superiorLayer(doc())!.continuum.columns[1]!.id,
      },
      { kind: "text", text: " carries the program." },
    ]);
    // The token reads "«superior node» is «its column header»", not "(column)".
    expect(toMarkdown(doc())).toContain("Delivery is Strong carries the program.");
  });

  it("resolves a synthesis token against the SUBORDINATE layer when both feed it (Q53)", () => {
    buildTwoMethodNode();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const superior = superiorLayer(doc())!;
    s().setColumnLabel(superior.continuum.columns[1]!.id, "Strong");
    s().setNodeParent(subordinateLayer(doc())!.nodes[0]!.id, superior.nodes[0]!.id);
    s().acceptSynthesis();
    const topColId = doc().overallJudgement!.continuum.columns[3]!.id;
    s().addJudgementScenario(topColId);
    const sc = doc().overallJudgement!.scenarios[0]!;
    // Reference the SUBORDINATE node + a SUBORDINATE column — the owning layer,
    // not synthesisLayer() (which is the superior layer here).
    s().updateJudgementScenarioParts(sc.id, [
      {
        kind: "token",
        targetId: subordinateLayer(doc())!.nodes[0]!.id,
        atColumnId: subordinateLayer(doc())!.continuum.columns[1]!.id,
      },
      { kind: "text", text: " must hold." },
    ]);
    expect(toMarkdown(doc())).toContain("Teaching quality is Sufficient must hold.");
  });

  it("prints a superior node's inter-layer conditional statement (Q54 (e))", () => {
    buildTwoMethodNode();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const superior = superiorLayer(doc())!;
    s().setColumnLabel(superior.continuum.columns[1]!.id, "Strong");
    s().setNodeParent(subordinateLayer(doc())!.nodes[0]!.id, superior.nodes[0]!.id);

    const supNode = superiorLayer(doc())!.nodes[0]!;
    const supCell = supNode.cells.find(
      (c) => c.columnId === superiorLayer(doc())!.continuum.columns[1]!.id,
    )!;
    s().addSuperiorScenario(supNode.id, supCell.id);
    const scId = superiorLayer(doc())!.nodes[0]!.cells.find((c) => c.id === supCell.id)!
      .scenarios[0]!.id;
    s().updateSuperiorScenarioParts(supNode.id, supCell.id, scId, [
      {
        kind: "token",
        targetId: subordinateLayer(doc())!.nodes[0]!.id,
        atColumnId: subordinateLayer(doc())!.continuum.columns[1]!.id,
      },
      { kind: "text", text: " makes Delivery strong." },
    ]);
    // Output B walks both layers; the superior node's scenario resolves the
    // subordinate node name + subordinate column (not "(unnamed)"/"(column)").
    expect(toMarkdown(doc())).toContain(
      "Teaching quality is Sufficient makes Delivery strong.",
    );
  });
});
