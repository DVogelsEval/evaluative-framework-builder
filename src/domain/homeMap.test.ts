import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { buildHomeMap } from "./homeMap";
import { subordinateLayer, superiorLayer } from "./layers";
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
const doc = () => s().doc as EvaluationQuestion;
const layer = () => subordinateLayer(doc())!;

/** A single-criterion framework with one Evidence/Method attached. */
function buildSingleCriterion() {
  s().createEQ("Program quality");
  s().setQuestionText("How good is the program?");
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
  s().addNode("Teaching quality");
  const nodeId = layer().nodes[0]!.id;
  s().addEvidenceMethod(nodeId, {
    name: "Classroom observation",
    whatWillBeDone: "Observe lessons.",
    fitJustification: "Observes teaching.",
  });
  return nodeId;
}

describe("buildHomeMap (R-125–R-127)", () => {
  it("stacks judgement → criterion → evidence with connecting edges", () => {
    buildSingleCriterion();
    s().acceptSynthesis();
    const map = buildHomeMap(doc());
    const j = map.boxes.find((b) => b.tier === "judgement")!;
    const c = map.boxes.find((b) => b.tier === "subordinate")!;
    const e = map.boxes.find((b) => b.tier === "evidence")!;
    expect(j).toBeDefined();
    expect(c.label).toBe("Teaching quality");
    expect(e.label).toBe("Classroom observation");
    // Lower tiers sit below higher ones (larger y).
    expect(c.y).toBeGreaterThan(j.y);
    expect(e.y).toBeGreaterThan(c.y);
    // Lines: judgement → criterion → evidence.
    expect(map.edges).toContainEqual({ fromId: j.id, toId: c.id });
    expect(map.edges).toContainEqual({ fromId: c.id, toId: e.id });
  });

  it("keeps the drill-in test ids stable", () => {
    buildSingleCriterion();
    s().acceptSynthesis();
    const map = buildHomeMap(doc());
    expect(map.boxes.find((b) => b.tier === "judgement")!.testId).toBe("home-judgement");
    expect(map.boxes.find((b) => b.tier === "subordinate")!.testId).toBe("home-node-0");
    expect(map.boxes.find((b) => b.tier === "evidence")!.testId).toBe("home-evidence");
  });

  it("rolls the criterion under the superior node, which feeds the judgement (Q4/Q33)", () => {
    buildSingleCriterion();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const supNodeId = superiorLayer(doc())!.nodes[0]!.id;
    s().setNodeParent(subordinateLayer(doc())!.nodes[0]!.id, supNodeId);
    s().acceptSynthesis();
    const map = buildHomeMap(doc());
    const j = map.boxes.find((b) => b.tier === "judgement")!;
    const sup = map.boxes.find((b) => b.tier === "superior")!;
    const sub = map.boxes.find((b) => b.tier === "subordinate")!;
    expect(sup.label).toBe("Delivery");
    // The superior layer feeds the judgement; the criterion rolls up to it.
    expect(map.edges).toContainEqual({ fromId: j.id, toId: sup.id });
    expect(map.edges).toContainEqual({ fromId: sup.id, toId: sub.id });
  });

  it("shows sub-methods beneath a combined mixed-methods source (R-127)", () => {
    const nodeId = buildSingleCriterion();
    s().addEvidenceMethod(nodeId, {
      name: "Pupil survey",
      whatWillBeDone: "Survey pupils.",
      fitJustification: "Captures pupil view.",
    });
    const [m1, m2] = doc().evidenceMethods;
    s().combineMethods(nodeId, [m1!.id, m2!.id], {
      name: "Mixed",
      type: "convergent",
      explanation: "Triangulate.",
    });
    const map = buildHomeMap(doc());
    const subs = map.boxes.filter((b) => b.tier === "submethod");
    expect(subs.map((b) => b.label).sort()).toEqual([
      "Classroom observation",
      "Pupil survey",
    ]);
    const combinedEv = map.boxes.find((b) => b.tier === "evidence" && b.label === "Mixed")!;
    for (const sm of subs) expect(sm.parentBoxId).toBe(combinedEv.id);
  });

  it("lays out each tier without overlapping boxes", () => {
    buildSingleCriterion();
    s().addNode("Access");
    s().addEvidenceMethod(layer().nodes[1]!.id, {
      name: "Records review",
      whatWillBeDone: "Check records.",
      fitJustification: "Shows access.",
    });
    const map = buildHomeMap(doc());
    const row = map.boxes
      .filter((b) => b.tier === "subordinate")
      .sort((a, b) => a.x - b.x);
    expect(row.length).toBe(2);
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!.x).toBeGreaterThanOrEqual(row[i - 1]!.x + row[i - 1]!.width);
    }
  });

  it("returns an empty map for an empty framework", () => {
    s().createEQ("Empty");
    const map = buildHomeMap(doc());
    expect(map.boxes).toEqual([]);
    expect(map.edges).toEqual([]);
  });
});
