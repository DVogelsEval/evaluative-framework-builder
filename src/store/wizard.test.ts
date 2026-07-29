import { beforeEach, describe, expect, it } from "vitest";
import { checkDocument } from "../domain/invariants";
import { useStore } from "./store";
import {
  firstIncompleteView,
  frameworkComplete,
  previousWizardView,
  WIZARD_STEP_ORDER,
} from "./wizard";

/**
 * The linear-forward wizard resumes at the first incomplete step (R-026/R-028)
 * in the J-journey order: question → continuum → structure → nodes →
 * criterion → review → evidence phase (per node: methods → mixed → tier,
 * Q24 redirect 2026-07-14) → connect → synthesis → home.
 */

beforeEach(() => {
  useStore.setState({ project: null, doc: null, view: "start", focusNodeId: null });
});

const s = () => useStore.getState();
const doc = () => s().doc!;

describe("firstIncompleteView — step order", () => {
  it("walks each gate in order as the document is built up", () => {
    s().createEQ("EQ");
    expect(firstIncompleteView(doc())).toBe("question");

    s().setQuestionText("How good is it?");
    expect(firstIncompleteView(doc())).toBe("continuum");

    const layer = () => doc().mesoLayers[0]!;
    s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
    s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
    expect(firstIncompleteView(doc())).toBe("structure");

    s().addNode(); // node exists but is unnamed → still on the list step (R-153)
    expect(firstIncompleteView(doc())).toBe("nodes");

    s().updateNodeField(layer().nodes[0]!.id, "name", "Teaching quality");
    expect(firstIncompleteView(doc())).toBe("criterion");

    for (const cell of layer().nodes[0]!.cells) {
      s().setCellPlainDescription(layer().nodes[0]!.id, cell.id, "Looks like this.");
    }
    expect(firstIncompleteView(doc())).toBe("review");

    s().confirmRubricReview();
    expect(firstIncompleteView(doc())).toBe("evidence");
    expect(frameworkComplete(doc())).toBe(false);

    const nodeId = layer().nodes[0]!.id;
    s().addEvidenceMethod(nodeId, {
      name: "Observation",
      whatWillBeDone: "Observe lessons.",
      fitJustification: "Fits.",
    });
    // Methods exist → the J9 mixed step comes before the tier (Q24 redirect)
    expect(firstIncompleteView(doc())).toBe("mixed");
    expect(frameworkComplete(doc())).toBe(false);

    s().resolveMixedMethods(nodeId); // completed or declined (R-164, Q20)
    expect(firstIncompleteView(doc())).toBe("evidence"); // tier still missing

    s().chooseEvidenceTier(nodeId, "list");
    expect(firstIncompleteView(doc())).toBe("evidence"); // vacuous tier (Q37)

    s().setDataDescription(nodeId, doc().evidenceMethods[0]!.id, "Notes.");
    expect(firstIncompleteView(doc())).toBe("connect"); // J10 pending (R-097)
    expect(frameworkComplete(doc())).toBe(false);

    // Every open cell needs a described Scenario before the pass moves on
    for (const cell of layer().nodes[0]!.cells) {
      s().addScenario(nodeId, cell.id);
      const scenario = layer()
        .nodes[0]!.cells.find((c) => c.id === cell.id)!
        .scenarios[0]!;
      s().updateScenarioParts(nodeId, cell.id, scenario.id, [
        { kind: "text", text: "Notes show this." },
      ]);
    }

    // J11: the synthesis choice itself is a step — done-or-declined (Q5/Q20)
    expect(firstIncompleteView(doc())).toBe("synthesis");
    expect(frameworkComplete(doc())).toBe(false);

    // Accepting opens the rubric; the step stays incomplete until fulfilled (⚠Q45)
    s().acceptSynthesis();
    expect(firstIncompleteView(doc())).toBe("synthesis");
    const judgement = () => doc().overallJudgement!;
    for (const column of judgement().continuum.columns) {
      s().setJudgementColumnLabel(column.id, `Level ${column.ordinal}`);
      s().setJudgementPlainDescription(column.id, "The judgement at this level.");
    }
    expect(firstIncompleteView(doc())).toBe("home");
    expect(frameworkComplete(doc())).toBe(true);

    // Declining resolves the step too — and recycles the built rubric (Q5)
    s().declineSynthesis();
    expect(doc().overallJudgement).toBeUndefined();
    expect(firstIncompleteView(doc())).toBe("home");
    expect(frameworkComplete(doc())).toBe(true);

    // Q69 audit (docs/ROADMAP-V2.md §3.2, docs/OPEN-QUESTIONS.md Q69): this
    // whole fixture never had a second criterion, never grew a second meso
    // layer, and just declined the Overall Judgement — a one-criterion,
    // no-judgement framework must be FULLY legal, not just wizard-complete.
    // No [gate] invariant may still be tripping here.
    expect(checkDocument(doc()).filter((i) => i.mode === "gate")).toEqual([]);
  });

  it("the R-112 free text fulfils an accepted synthesis by itself (⚠Q45)", () => {
    s().createEQ("EQ");
    s().setQuestionText("How good is it?");
    s().acceptSynthesis();
    expect(frameworkComplete(doc())).toBe(false); // headers/plain empty

    s().setSynthesisFreeText("Sufficient overall when both criteria clear the bar.");
    // the synthesis step itself is now fulfilled; earlier steps still gate
    expect(firstIncompleteView(doc())).toBe("continuum");
  });

  it("previousWizardView walks the canonical order backwards, ungated (Back control)", () => {
    // Every step's Back target is simply the step before it in the order —
    // no completion check anywhere on the way back.
    for (let i = 1; i < WIZARD_STEP_ORDER.length; i++) {
      expect(previousWizardView(WIZARD_STEP_ORDER[i]!)).toBe(WIZARD_STEP_ORDER[i - 1]);
    }
    expect(previousWizardView("question")).toBeNull(); // first step — nothing earlier
    expect(previousWizardView("start")).toBeNull(); // outside the wizard
  });

  it("the furthest-reached frontier is derived: firstIncompleteView never moves past an incomplete gate", () => {
    // Build to the evidence step, then break an earlier step: the frontier
    // retreats with it, so Continue (one gated step at a time) can only
    // re-advance through the re-completed gates — never skip ahead.
    s().createEQ("EQ");
    s().setQuestionText("How good is it?");
    const layer = () => doc().mesoLayers[0]!;
    s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
    s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
    s().addNode("Teaching quality");
    for (const cell of layer().nodes[0]!.cells) {
      s().setCellPlainDescription(layer().nodes[0]!.id, cell.id, "Looks like this.");
    }
    s().confirmRubricReview();
    expect(firstIncompleteView(doc())).toBe("evidence"); // the frontier

    s().setQuestionText(""); // revisit and redo the very first step
    expect(firstIncompleteView(doc())).toBe("question"); // frontier retreats
    s().setQuestionText("How good is it, really?");
    expect(firstIncompleteView(doc())).toBe("evidence"); // and returns
  });

  it("an incomplete second node pulls the wizard back to the description step", () => {
    s().createEQ("EQ");
    s().setQuestionText("How good is it?");
    const layer = () => doc().mesoLayers[0]!;
    s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
    s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
    s().addNode("Done");
    for (const cell of layer().nodes[0]!.cells) {
      s().setCellPlainDescription(layer().nodes[0]!.id, cell.id, "Described.");
    }
    s().addNode("Not done");
    expect(firstIncompleteView(doc())).toBe("criterion");
  });
});
