import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { handoffTargets, serializeContext, type HandoffTarget } from "./aiContext";
import { DEFAULT_TEMPLATES } from "./aiTemplateDefaults";
import { renderPrompt } from "./aiTemplates";
import { subordinateLayer } from "./layers";
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
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A single-criterion framework: highlighted value-language, two conclusions
 *  described, one Evidence/Method, and a data-description-list tier. */
function buildFramework(): { nodeId: string; methodId: string } {
  s().createEQ("Reading program quality");
  s().setQuestionText("How good is the reading program?");
  s().addValueSpan(4, 8, "good"); // "How good…"
  const [c0, c1] = layer().continuum.columns;
  s().setColumnLabel(c0!.id, "Insufficient");
  s().setColumnLabel(c1!.id, "Sufficient");
  s().addNode("Teaching quality");
  const node = layer().nodes[0]!;
  const nodeId = node.id;
  const cellFor = (columnId: string) => node.cells.find((c) => c.columnId === columnId)!.id;
  s().setCellPlainDescription(nodeId, cellFor(c0!.id), "Lessons are unstructured.");
  s().setCellPlainDescription(nodeId, cellFor(c1!.id), "Lessons are structured.");
  s().addEvidenceMethod(nodeId, {
    name: "Classroom observation",
    whatWillBeDone: "Observe ten reading lessons.",
    fitJustification: "Observes teaching directly.",
  });
  const methodId = doc().evidenceMethods[0]!.id;
  s().chooseEvidenceTier(nodeId, "list");
  s().setDataDescription(nodeId, methodId, "Observation notes show pupil engagement.");
  return { nodeId, methodId };
}

describe("handoffTargets (⚠Q57)", () => {
  it("offers the EQ, the continuum, and each subordinate node — judgement only when present", () => {
    buildFramework();
    const kinds = handoffTargets(doc()).map((t) => t.kind);
    expect(kinds).toEqual(["evaluationQuestion", "continuum", "mesoNode"]);

    s().acceptSynthesis();
    expect(handoffTargets(doc()).some((t) => t.kind === "overallJudgement")).toBe(true);
  });
});

describe("serializeContext (R-140; AI-HANDOFF.md §2)", () => {
  const find = (kind: HandoffTarget["kind"]) =>
    handoffTargets(doc()).find((t) => t.kind === kind)!;

  it("serialises the EQ slice as plain text (question, value-language, matrix, glossary)", () => {
    buildFramework();
    const ctx = serializeContext(doc(), find("evaluationQuestion"));
    expect(ctx.evaluationQuestion).toContain("How good is the reading program?");
    expect(ctx.valueLanguage).toContain("good");
    expect(ctx.evidenceMatrix).toContain("Classroom observation");
    expect(ctx.evidenceMatrix).toContain("Teaching quality");
    expect(ctx.ancestorChain).toContain("Teaching quality");
    expect(ctx.glossaryTerms).toContain("Merit");
  });

  it("serialises the continuum with both sides and the Sufficient Bar", () => {
    buildFramework();
    const ctx = serializeContext(doc(), find("continuum"));
    expect(ctx.continuumTable).toContain("Insufficient");
    expect(ctx.continuumTable).toContain("Sufficient");
    expect(ctx.continuumTable).toContain("Sufficient Bar");
  });

  it("serialises a node's descriptions, evidence list, and tier", () => {
    buildFramework();
    const ctx = serializeContext(doc(), find("mesoNode"));
    expect(ctx.nodeName).toBe("Teaching quality");
    expect(ctx.nodeKindLabel).toBe("criterion");
    expect(ctx.cellDescriptions).toContain("Lessons are unstructured.");
    expect(ctx.cellDescriptions).toContain("Lessons are structured.");
    expect(ctx.evidenceList).toContain("Classroom observation");
    expect(ctx.evidenceList).toContain("Observe ten reading lessons.");
    expect(ctx.evidenceTier).toContain("Data description list");
    expect(ctx.evidenceTier).toContain("Observation notes show pupil engagement.");
  });

  it("never leaks a UUID into any serialised value (round-trip by reading, not id)", () => {
    buildFramework();
    s().acceptSynthesis();
    for (const target of handoffTargets(doc())) {
      for (const value of Object.values(serializeContext(doc(), target))) {
        expect(value).not.toMatch(UUID);
      }
    }
  });
});

describe("rendering a bundled template against real context", () => {
  it("leaves no unfilled placeholder for T2 (mesoNode) or T4 (evaluationQuestion)", () => {
    buildFramework();
    const t2 = DEFAULT_TEMPLATES.find((t) => t.id === "critique-plain-descriptions")!;
    const nodeTarget = handoffTargets(doc()).find((t) => t.kind === "mesoNode")!;
    const p2 = renderPrompt(t2.body, serializeContext(doc(), nodeTarget));
    expect(p2).not.toContain("{{");
    expect(p2).toContain("Teaching quality");

    const t4 = DEFAULT_TEMPLATES.find((t) => t.id === "check-matrix-coverage")!;
    const eqTarget = handoffTargets(doc()).find((t) => t.kind === "evaluationQuestion")!;
    const p4 = renderPrompt(t4.body, serializeContext(doc(), eqTarget));
    expect(p4).not.toContain("{{");
    expect(p4).toContain("How good is the reading program?");
  });
});
