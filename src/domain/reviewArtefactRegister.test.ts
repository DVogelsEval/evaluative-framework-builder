import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { subordinateLayer } from "./layers";
import { buildReviewArtefact } from "./reviewArtefact";
import type { EvaluationQuestion } from "./schema";

/**
 * The required language-register lint test (docs/ROADMAP-V2.md §2.3,
 * extension spec §5.3 decision 8): the review artefact's APP-GENERATED
 * CHROME must never use the canonical vocabulary — the authoring surface
 * stays faithful to the literature; the review surface does not.
 *
 * Every text field in this fixture is stuffed with the forbidden jargon, so
 * if any of it leaked into the artefact's own chrome (not the user's typed
 * prose, which the rule does not govern), this test would catch it.
 */

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

const FORBIDDEN = /evaluand|criteri(on|a) of merit|sufficient bar|continuum|warrant|meso|macro|micro synthesis/i;

function buildJargonStuffedFramework() {
  s().createEQ("evaluand criteria of merit continuum warrant meso macro");
  s().setQuestionText("How good is the evaluand's continuum?");
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Weak side of the continuum");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Strong (above the sufficient bar)");
  s().addNode("Criteria of merit — teaching quality");
  const node = () => layer().nodes[0]!;
  for (const cell of node().cells) {
    s().setCellPlainDescription(node().id, cell.id, "A warrant-laden plain description mentioning meso and macro synthesis.");
  }
}

describe("review artefact register — no canonical vocabulary in app-generated chrome", () => {
  it("the artefact's own chrome (framing text, labels, headings) never uses the forbidden terms", () => {
    buildJargonStuffedFramework();
    const html = buildReviewArtefact(doc());

    // Isolate the app-generated chrome from user-authored content: strip out
    // everything the user actually typed (question text, column labels, node
    // names, plain descriptions, case label/prose) before scanning, since the
    // rule governs chrome, not the user's own prose (docs/ROADMAP-V2.md §2.3).
    let chrome = html;
    const userStrings = [
      doc().title,
      doc().questionText,
      ...layer().continuum.columns.map((c) => c.label),
      ...layer().nodes.map((n) => n.name),
      ...layer().nodes.flatMap((n) => n.cells.map((c) => c.plainDescription ?? "")),
      ...doc().simCases.map((c) => c.label),
      ...doc().simCases.map((c) => c.prose),
    ].filter((v) => v.trim() !== "");
    for (const str of userStrings) {
      chrome = chrome.split(str).join("");
    }

    expect(chrome).not.toMatch(FORBIDDEN);
  });

  it("the language-mapping table is honoured in the framing copy itself", () => {
    buildJargonStuffedFramework();
    const html = buildReviewArtefact(doc());
    // Positive checks: the plain-language replacements ARE present.
    expect(html).toMatch(/good enough|level/i);
    expect(html).not.toContain("Overall Judgement");
    expect(html).not.toContain("Column Header");
    expect(html).not.toContain("rubric column");
  });
});
