import {
  checkCellContent,
  checkColumnHeaders,
  checkContinuum,
  checkEvidenceTier,
  checkEvidenceTierComplete,
  checkNodeList,
  checkPlainDescriptionsComplete,
  checkScenariosComplete,
  checkSynthesisComplete,
} from "../domain/invariants";
import { hasSecondLayer, secondLayerComplete } from "../domain/layers";
import type { EvaluationQuestion, MesoNode } from "../domain/schema";
import type { View } from "./store";

/**
 * The canonical linear-forward step order (J0). "start" (the Project/Open
 * view) sits outside the wizard; "home" is where a complete pass exits.
 */
export const WIZARD_STEP_ORDER: readonly View[] = [
  "question",
  "continuum",
  "structure",
  "nodes",
  "criterion",
  "review",
  "evidence",
  "mixed",
  "connect",
  "secondlayer",
  "synthesis",
  "home",
];

/**
 * The wizard step before `view` — the target of the ungated Back control.
 * Null at the first step and outside the wizard. Back never gates: earlier
 * work may always be revisited and redone; each step's own Continue gate
 * re-applies on the way forward, so the furthest-reached frontier (which is
 * `firstIncompleteView`, derived — never stored) cannot be overshot, because
 * Continue only ever advances one gated step at a time.
 */
export function previousWizardView(view: View): View | null {
  const i = WIZARD_STEP_ORDER.indexOf(view);
  return i > 0 ? WIZARD_STEP_ORDER[i - 1]! : null;
}

/**
 * The linear-forward wizard resumes at the first incomplete step (R-026/R-028);
 * a document with every gate satisfied opens on the Home Window (GWT-1.3, J0).
 * Step order: question → continuum → structure (J3) → nodes (J4) →
 * criterion (J5) → review (J6) → evidence phase (per node J7 → mixed J9 →
 * tier J8; Q24 redirect) → connect (J10) → synthesis (J11) → home.
 */
export function firstIncompleteView(doc: EvaluationQuestion): View {
  if (doc.questionText.trim() === "") return "question";

  const layer = doc.mesoLayers.find((l) => l.tierOrder === 0);
  if (!layer) return "question";

  const continuumGates = [
    ...checkContinuum(layer.continuum),
    ...checkColumnHeaders(layer.continuum),
  ].filter((i) => i.mode === "gate");
  if (continuumGates.length > 0) return "continuum";

  // No nodes yet ⇒ the structuring choice (J3) hasn't been acted on.
  if (layer.nodes.length === 0) return "structure";

  if (checkNodeList(layer).length > 0) return "nodes";

  if (
    layer.nodes.some(
      (n) =>
        checkCellContent(n).length > 0 || checkPlainDescriptionsComplete(n).length > 0,
    )
  ) {
    return "criterion";
  }

  if (!layer.reviewConfirmed) return "review";

  // Per node the evidence phase runs J7 → J9 → J8 (Q24 redirected 2026-07-14):
  // methods first, then the mixed-methods step, then the evidence tier — a
  // combined mixed source must exist before the tier is described. A node with
  // no methods yet resumes on the evidence view; one with methods but an
  // unresolved mixed step (R-162–R-164, the per-node done-or-declined record
  // Q20 asks for) resumes on the mixed step; then the tier.
  const evidenceNode = layer.nodes.find(
    (n) => evidenceIncomplete(n) || mixedMethodsUnresolved(n),
  );
  if (evidenceNode) {
    return evidenceNode.evidenceLinks.length >= 1 && mixedMethodsUnresolved(evidenceNode)
      ? "mixed"
      : "evidence";
  }

  // J10: every open cell of every node needs its Evidence-row scenario before
  // the framework leaves the linear pass (R-097, GWT-10.5).
  if (layer.nodes.some((n) => scenariosIncomplete(n))) return "connect";

  // Slice 7: the second meso layer is optional, but once *grown* it must be
  // completed before synthesis (the Q20 done-or-declined term — declining is
  // removing it). Single-layer frameworks skip this step entirely (⚠Q49).
  if (hasSecondLayer(doc) && !secondLayerComplete(doc)) return "secondlayer";

  // J11: the synthesis is optional but its *choice* is not — the step resolves
  // by being declined or by the accepted rubric being fulfilled (Q5/Q20, ⚠Q45).
  if (!synthesisResolved(doc)) return "synthesis";

  return "home";
}

/** The J11 synthesis step was declined, or accepted and fulfilled (Q20, ⚠Q45). */
export function synthesisResolved(doc: EvaluationQuestion): boolean {
  if (doc.overallJudgement !== undefined) {
    return checkSynthesisComplete(doc).length === 0;
  }
  return doc.synthesisDeclined === true;
}

/** A node still has open cells without a described Scenario (R-097). */
export function scenariosIncomplete(node: MesoNode): boolean {
  return checkScenariosComplete(node).length > 0;
}

/** The node's J9 mixed-methods step has neither been completed nor declined. */
export function mixedMethodsUnresolved(node: MesoNode): boolean {
  return node.mixedMethodsResolved !== true;
}

/** A node still needs evidence work: tier absent/linkless (Invariant 8) or
 *  its description not yet complete (R-077, ⚠Q37). */
export function evidenceIncomplete(node: MesoNode): boolean {
  return (
    checkEvidenceTier(node).some((i) => i.mode === "gate") ||
    checkEvidenceTierComplete(node).length > 0
  );
}

/**
 * Whether the linear-forward lock has released and free navigation is unlocked
 * (R-028/R-029, Q20). Confirmed for Slice 9 to match Q20's wording exactly:
 * `firstIncompleteView` reaches "home" only once the mandatory stages are done
 * (question → continuum → structure → nodes → criterion → review → per-node
 * evidence tier) **and** each optional stage is done-or-declined — the per-node
 * mixed-methods step (declined = "no mixed methods"), the second meso layer
 * (declined = removed), and the synthesis (declined = skipped). No optional
 * stage remains only-partially-wired, so no tightening was needed.
 */
export function frameworkComplete(doc: EvaluationQuestion): boolean {
  return firstIncompleteView(doc) === "home";
}
