import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { subordinateLayer } from "./layers";
import { buildReviewArtefact } from "./reviewArtefact";
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

/** A single-criterion framework with a Boolean condition and one SimCase,
 *  mirroring the browser-verified fixture from Phase 2.1. */
function buildConditionedFrameworkWithCase() {
  s().createEQ("Reading program quality");
  s().setQuestionText("How good is the reading program?");
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Weak");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Strong");
  s().addNode("Teaching quality");
  const node = () => layer().nodes[0]!;
  for (const cell of node().cells) {
    s().setCellPlainDescription(node().id, cell.id, "Described.");
  }
  s().addEvidenceMethod(node().id, {
    name: "Classroom observation",
    whatWillBeDone: "Observe.",
    fitJustification: "Fits.",
  });
  const methodId = s().doc!.evidenceMethods[0]!.id;
  s().chooseEvidenceTier(node().id, "rubric");
  const tierColumns = () => (node().evidenceTier as { continuum: { columns: { id: string }[] } }).continuum.columns;
  s().setEvidenceColumnLabel(node().id, tierColumns()[0]!.id, "Not Yet");
  s().setEvidenceColumnLabel(node().id, tierColumns()[1]!.id, "Good");

  const weakCellId = node().cells[0]!.id;
  s().setCellCondition(node().id, weakCellId, {
    mode: "boolean",
    booleanLogic: {
      root: {
        type: "TERM",
        term: {
          evidenceElementId: methodId,
          evidenceElementLabel: "[Classroom observation]",
          comparator: "is",
          value: "Strong",
          valueLabel: "Strong",
        },
      },
      plainEnglish: "[Classroom observation] is Strong",
    },
    lastModified: new Date().toISOString(),
  });

  // The real key format is `${nodeId}::${termSlotKey}` — the same "global
  // session key" EvidenceValueInputs.tsx builds and SimulateJudgementView's
  // "Save as Case" persists verbatim — NOT a bare termSlotKey.
  s().addSimCase({
    label: "Borderline lesson",
    prose: "A lesson with a fully engaged classroom throughout.",
    values: { [`${node().id}::${methodId}`]: "Strong" },
    expectedToFail: true,
  });

  return { node, methodId, weakCellId };
}

describe("buildReviewArtefact — structure and network safety", () => {
  it("returns a complete, self-contained HTML document", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
  });

  it("makes zero network requests: no external URLs, no script/link src, no fetch/XHR", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest/);
  });

  it("carries the SIMULATED label on every case", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).toContain("Borderline lesson");
    expect(html).toContain("SIMULATED");
  });

  it("shows the Sufficient Bar in plain language, deriving a statement when none is authored", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).toMatch(/good enough/i);
  });

  it("uses the authored Sufficient Bar definition when present (Q66)", () => {
    buildConditionedFrameworkWithCase();
    layer().continuum.sufficientBarDefinition = "Consistently strong, engaged teaching.";
    useStore.setState({ doc: { ...doc() } });
    const html = buildReviewArtefact(doc());
    expect(html).toContain("Consistently strong, engaged teaching.");
  });

  it("handles a framework with no cases gracefully (empty case list, no crash)", () => {
    s().createEQ("Empty");
    const html = buildReviewArtefact(doc());
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("SIMULATED");
  });

  it("actually resolves the case's condition to the correct column — not just null (regression guard)", () => {
    const { node } = buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    const weakColumnId = node().cells[0]!.columnId;
    // The closure-scoped caseAnswers array must carry the REAL resolved
    // columnId, not null — a silent "always not resolvable" bug would pass
    // every other test in this file (they don't check the specific answer).
    const match = html.match(/var caseAnswers = (\[.*?\]);/);
    expect(match).not.toBeNull();
    const caseAnswers = JSON.parse(match![1]!) as { id: string; columnId: string | null }[];
    expect(caseAnswers).toHaveLength(1);
    expect(caseAnswers[0]!.columnId).toBe(weakColumnId);
  });
});

describe("buildReviewArtefact — blind-first rule (extension spec decision 7)", () => {
  it("never prints the framework's placement in the static markup (outside the script)", () => {
    const { weakCellId: _w } = buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    const scriptStart = html.indexOf("<script>");
    const staticMarkup = html.slice(0, scriptStart);
    // The resolved answer for the one case is "Weak" — it must not appear
    // paired with the case in the visible markup before the script runs.
    // (The word may legitimately appear as a <select><option> level name —
    // the rule is about not REVEALING THE ANSWER, not hiding level names.)
    expect(staticMarkup).not.toMatch(/data-(framework-placement|answer|correct)/i);
  });

  it("keeps the answer data closure-scoped: never assigned to window, never a labelled JSON blob", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).not.toMatch(/window\.\w*(?:[Aa]nswer|[Pp]lacement|[Cc]ase)/);
    expect(html).not.toMatch(/<script type="application\/json">/);
  });

  it("reveals nothing until the reviewer places a case: the reveal button starts disabled", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).toContain('id="reveal-btn" disabled');
  });
});

describe("buildReviewArtefact — critique download shape matches critiqueSchema", () => {
  it("the download handler builds placements/addedCases/reviewerLabel/importedAt", () => {
    buildConditionedFrameworkWithCase();
    const html = buildReviewArtefact(doc());
    expect(html).toContain("placements");
    expect(html).toContain("addedCases");
    expect(html).toContain("reviewerLabel");
    expect(html).toContain("importedAt");
    expect(html).toContain("simCaseId");
    expect(html).toContain("placedAtColumnId");
  });
});
