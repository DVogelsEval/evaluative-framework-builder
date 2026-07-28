import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { firstIncompleteView } from "../store/wizard";
import { checkMesoLayers } from "./invariants";
import {
  findColumnInAnyLayer,
  hasSecondLayer,
  orderedLayersForOutput,
  secondLayerComplete,
  subordinateLayer,
  superiorLayer,
  synthesisLayer,
} from "./layers";
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

/**
 * Build a single-layer framework complete through the connect step, so the
 * only thing standing between it and synthesis is the optional second layer.
 */
function buildToConnect() {
  s().createEQ("EQ");
  s().setQuestionText("How good is it?");
  const layer = () => subordinateLayer(doc())!;
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Insufficient");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Sufficient");
  s().addNode("Teaching quality");
  const nodeId = layer().nodes[0]!.id;
  for (const cell of layer().nodes[0]!.cells) {
    s().setCellPlainDescription(nodeId, cell.id, "Looks like this.");
  }
  s().confirmRubricReview();
  s().addEvidenceMethod(nodeId, {
    name: "Observation",
    whatWillBeDone: "Observe lessons.",
    fitJustification: "Fits.",
  });
  s().resolveMixedMethods(nodeId);
  s().chooseEvidenceTier(nodeId, "list");
  s().setDataDescription(nodeId, doc().evidenceMethods[0]!.id, "Notes.");
  for (const cell of layer().nodes[0]!.cells) {
    s().addScenario(nodeId, cell.id);
    const scenario = layer().nodes[0]!.cells.find((c) => c.id === cell.id)!.scenarios[0]!;
    s().updateScenarioParts(nodeId, cell.id, scenario.id, [
      { kind: "text", text: "Notes show this." },
    ]);
  }
}

describe("second meso layer — grow, roll up, cap (Slice 7)", () => {
  it("grows a superior layer at tierOrder 1; the subordinate keeps evidence (Q33)", () => {
    buildToConnect();
    expect(hasSecondLayer(doc())).toBe(false);
    expect(synthesisLayer(doc())).toBe(subordinateLayer(doc()));

    s().addSecondMesoLayer("components");
    expect(hasSecondLayer(doc())).toBe(true);
    const superior = superiorLayer(doc())!;
    expect(superior.tierOrder).toBe(1);
    expect(superior.kind).toBe("components");
    // Synthesis now feeds from the superior layer (Q4).
    expect(synthesisLayer(doc())).toBe(superior);
    // Evidence stays on the subordinate layer.
    expect(subordinateLayer(doc())!.nodes[0]!.evidenceLinks.length).toBe(1);
    expect(superior.nodes.length).toBe(0);
  });

  it("refuses a third meso layer (two-layer cap, Invariant 18/Q3)", () => {
    buildToConnect();
    s().addSecondMesoLayer("components");
    s().addSecondMesoLayer("criteria"); // ignored — already two layers
    expect(doc().mesoLayers.length).toBe(2);
  });

  it("gates completion on named nodes, filled headers, and full rollup (⚠Q49)", () => {
    buildToConnect();
    s().addSecondMesoLayer("components");
    expect(secondLayerComplete(doc())).toBe(false); // no superior nodes yet

    s().addSuperiorNode("Delivery");
    const superior = () => superiorLayer(doc())!;
    // Headers still blank on the superior continuum.
    expect(secondLayerComplete(doc())).toBe(false);
    s().setColumnLabel(superior().continuum.columns[0]!.id, "Weak");
    s().setColumnLabel(superior().continuum.columns[1]!.id, "Strong");
    // Subordinate node not rolled up yet.
    expect(secondLayerComplete(doc())).toBe(false);

    const childId = subordinateLayer(doc())!.nodes[0]!.id;
    s().setNodeParent(childId, superior().nodes[0]!.id);
    expect(secondLayerComplete(doc())).toBe(true);

    // An unnamed superior node breaks completion again.
    s().addSuperiorNode("");
    expect(secondLayerComplete(doc())).toBe(false);
  });

  it("removing a superior node clears the rollup that pointed at it", () => {
    buildToConnect();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const superior = () => superiorLayer(doc())!;
    const parentId = superior().nodes[0]!.id;
    const childId = subordinateLayer(doc())!.nodes[0]!.id;
    s().setNodeParent(childId, parentId);
    expect(subordinateLayer(doc())!.nodes[0]!.parentNodeId).toBe(parentId);

    s().removeSuperiorNode(parentId);
    expect(subordinateLayer(doc())!.nodes[0]!.parentNodeId).toBeUndefined();
    expect(doc().recycleBin.deletedNodes.length).toBeGreaterThan(0);
  });

  it("removing the second layer recycles it and clears every rollup (decline)", () => {
    buildToConnect();
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const childId = subordinateLayer(doc())!.nodes[0]!.id;
    s().setNodeParent(childId, superiorLayer(doc())!.nodes[0]!.id);

    s().removeSecondMesoLayer();
    expect(hasSecondLayer(doc())).toBe(false);
    expect(subordinateLayer(doc())!.nodes[0]!.parentNodeId).toBeUndefined();
    expect(synthesisLayer(doc())).toBe(subordinateLayer(doc()));
  });

  it("setNodeParent refuses a parent that is not an existing superior node", () => {
    buildToConnect();
    s().addSecondMesoLayer("components");
    const childId = subordinateLayer(doc())!.nodes[0]!.id;
    s().setNodeParent(childId, "not-a-real-id");
    expect(subordinateLayer(doc())!.nodes[0]!.parentNodeId).toBeUndefined();
  });
});

describe("Invariant 18 — checkMesoLayers", () => {
  it("passes a clean single-layer document and a clean two-layer document", () => {
    buildToConnect();
    expect(checkMesoLayers(doc())).toEqual([]);
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    s().setNodeParent(
      subordinateLayer(doc())!.nodes[0]!.id,
      superiorLayer(doc())!.nodes[0]!.id,
    );
    expect(checkMesoLayers(doc())).toEqual([]);
  });

  it("flags a third layer, a dangling parent, and evidence on the superior layer", () => {
    buildToConnect();
    // Force-mutate the document into three broken states the store forbids, to
    // prove the invariant detects them regardless of how they arose.
    const broken = structuredClone(doc());
    broken.mesoLayers.push(
      { ...broken.mesoLayers[0]!, id: crypto.randomUUID(), tierOrder: 1 },
      { ...broken.mesoLayers[0]!, id: crypto.randomUUID(), tierOrder: 2 },
    );
    broken.mesoLayers[0]!.nodes[0]!.parentNodeId = "ghost";
    useStore.setState({ doc: broken });
    const issues = checkMesoLayers(doc());
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.invariant === 18 && i.mode === "gate")).toBe(true);
  });
});

describe("wizard routing with a second layer", () => {
  it("routes to secondlayer while incomplete, then to synthesis once complete", () => {
    buildToConnect();
    // Single layer: connect done ⇒ straight to synthesis.
    expect(firstIncompleteView(doc())).toBe("synthesis");

    s().addSecondMesoLayer("components");
    expect(firstIncompleteView(doc())).toBe("secondlayer");

    s().addSuperiorNode("Delivery");
    const superior = () => superiorLayer(doc())!;
    s().setColumnLabel(superior().continuum.columns[0]!.id, "Weak");
    s().setColumnLabel(superior().continuum.columns[1]!.id, "Strong");
    s().setNodeParent(
      subordinateLayer(doc())!.nodes[0]!.id,
      superior().nodes[0]!.id,
    );
    expect(firstIncompleteView(doc())).toBe("synthesis");

    // Declining (removing) the layer also clears the stage.
    s().removeSecondMesoLayer();
    expect(firstIncompleteView(doc())).toBe("synthesis");
  });
});

/** Grow a two-layer framework with the criterion rolled up into one component. */
function buildTwoLayer() {
  buildToConnect();
  s().addSecondMesoLayer("components");
  s().addSuperiorNode("Delivery");
  const superior = superiorLayer(doc())!;
  s().setColumnLabel(superior.continuum.columns[0]!.id, "Weak");
  s().setColumnLabel(superior.continuum.columns[1]!.id, "Strong");
  s().setNodeParent(subordinateLayer(doc())!.nodes[0]!.id, superior.nodes[0]!.id);
}

describe("findColumnInAnyLayer (Q53 reading point 2)", () => {
  it("resolves a column owned by either meso layer, undefined for an unknown id", () => {
    buildTwoLayer();
    const subCol = subordinateLayer(doc())!.continuum.columns[1]!;
    const supCol = superiorLayer(doc())!.continuum.columns[1]!;
    expect(findColumnInAnyLayer(doc(), subCol.id)?.label).toBe("Sufficient");
    expect(findColumnInAnyLayer(doc(), supCol.id)?.label).toBe("Strong");
    expect(findColumnInAnyLayer(doc(), "not-a-column")).toBeUndefined();
  });
});

describe("inter-layer connect pass — superior-node scenarios (Q53/Q54)", () => {
  it("stores a subordinate-node token with its clicked column, keeps typed prose", () => {
    buildTwoLayer();
    const superior = () => superiorLayer(doc())!;
    const supNode = superior().nodes[0]!;
    const supCell = supNode.cells.find(
      (c) => c.columnId === superior().continuum.columns[1]!.id,
    )!;
    s().addSuperiorScenario(supNode.id, supCell.id);
    const scenarioId = superiorLayer(doc())!.nodes[0]!.cells.find((c) => c.id === supCell.id)!
      .scenarios[0]!.id;

    const subNode = subordinateLayer(doc())!.nodes[0]!;
    const subCol = subordinateLayer(doc())!.continuum.columns[1]!;
    s().updateSuperiorScenarioParts(supNode.id, supCell.id, scenarioId, [
      { kind: "token", targetId: subNode.id, atColumnId: subCol.id },
      { kind: "text", text: " carries the component." },
    ]);

    const stored = superiorLayer(doc())!.nodes[0]!.cells.find((c) => c.id === supCell.id)!
      .scenarios[0]!.parts;
    expect(stored).toEqual([
      { kind: "token", targetId: subNode.id, atColumnId: subCol.id },
      { kind: "text", text: " carries the component." },
    ]);
  });

  it("refuses a token that does not name a subordinate node", () => {
    buildTwoLayer();
    const superior = () => superiorLayer(doc())!;
    const supNode = superior().nodes[0]!;
    const supCell = supNode.cells[0]!;
    s().addSuperiorScenario(supNode.id, supCell.id);
    const scenarioId = superiorLayer(doc())!.nodes[0]!.cells[0]!.scenarios[0]!.id;

    // The superior node's OWN id is not a subordinate node — the token drops.
    s().updateSuperiorScenarioParts(supNode.id, supCell.id, scenarioId, [
      { kind: "token", targetId: supNode.id },
      { kind: "text", text: "kept" },
    ]);
    expect(
      superiorLayer(doc())!.nodes[0]!.cells[0]!.scenarios[0]!.parts,
    ).toEqual([{ kind: "text", text: "kept" }]);
  });

  it("removes a superior scenario to the Recycle Bin and renumbers the rest", () => {
    buildTwoLayer();
    const superior = () => superiorLayer(doc())!;
    const supNode = superior().nodes[0]!;
    const supCell = supNode.cells[0]!;
    s().addSuperiorScenario(supNode.id, supCell.id);
    s().addSuperiorScenario(supNode.id, supCell.id);
    const first = superiorLayer(doc())!.nodes[0]!.cells[0]!.scenarios[0]!.id;
    const before = doc().recycleBin.deletedNodes.length;

    s().removeSuperiorScenario(supNode.id, supCell.id, first);
    const remaining = superiorLayer(doc())!.nodes[0]!.cells[0]!.scenarios;
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.order).toBe(0);
    expect(doc().recycleBin.deletedNodes.length).toBe(before + 1);
  });
});

describe("Output-B ordering hook (R-123)", () => {
  it("orders components before criteria regardless of tierOrder", () => {
    buildToConnect(); // subordinate is criteria
    s().addSecondMesoLayer("components"); // superior is components
    const ordered = orderedLayersForOutput(doc());
    expect(ordered[0]!.kind).toBe("components");
    expect(ordered[1]!.kind).toBe("criteria");
  });
});
