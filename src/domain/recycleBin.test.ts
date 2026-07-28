import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { subordinateLayer, superiorLayer } from "./layers";
import { deletedItems } from "./recycleBin";
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

describe("deletedItems (R-149, Q18)", () => {
  it("is empty for a fresh document", () => {
    s().createEQ("EQ");
    expect(deletedItems(doc())).toEqual([]);
  });

  it("summarises a deleted evidence link and criterion, newest first", () => {
    s().createEQ("EQ");
    s().addNode("Teaching quality");
    s().addNode("Access");
    const accessId = layer().nodes[1]!.id;
    s().addEvidenceMethod(accessId, {
      name: "Records review",
      whatWillBeDone: "",
      fitJustification: "",
    });
    const linkId = layer().nodes[1]!.evidenceLinks[0]!.id;
    s().removeEvidenceLink(accessId, linkId); // deleted first
    s().removeNode(layer().nodes[0]!.id); // "Teaching quality" deleted second (newest)

    const items = deletedItems(doc());
    expect(items).toHaveLength(2);
    // Newest first: the criterion.
    expect(items[0]!.kind).toBe("Criterion / Component");
    expect(items[0]!.label).toBe("Teaching quality");
    // The evidence link resolves its method name from the pool.
    expect(
      items.some((i) => i.kind === "Evidence link" && i.label === "Records review"),
    ).toBe(true);
  });
});

describe("restoreDeletedItem (R-149/Q18/⚠Q56)", () => {
  it("restores a deleted criterion into its layer, empties the bin entry, renumbers", () => {
    s().createEQ("EQ");
    s().addNode("Teaching quality");
    s().addNode("Access");
    const teachingId = layer().nodes[0]!.id;
    s().removeNode(teachingId);
    expect(layer().nodes.map((n) => n.name)).toEqual(["Access"]);

    const result = s().restoreDeleted(0);
    expect(result).toEqual({ restored: true, kind: "Criterion / Component" });
    expect(layer().nodes.map((n) => n.name).sort()).toEqual(["Access", "Teaching quality"]);
    expect(layer().nodes.map((n) => n.order)).toEqual([0, 1]);
    expect(doc().recycleBin.deletedNodes.length).toBe(0);
  });

  it("restores a deleted evidence link back onto its node", () => {
    s().createEQ("EQ");
    s().addNode("Teaching");
    const nodeId = layer().nodes[0]!.id;
    s().addEvidenceMethod(nodeId, { name: "Obs", whatWillBeDone: "", fitJustification: "" });
    const linkId = layer().nodes[0]!.evidenceLinks[0]!.id;
    s().removeEvidenceLink(nodeId, linkId);
    expect(layer().nodes[0]!.evidenceLinks.length).toBe(0);

    expect(s().restoreDeleted(0).restored).toBe(true);
    expect(layer().nodes[0]!.evidenceLinks.length).toBe(1);
  });

  it("restores a deleted scenario back into its cell", () => {
    s().createEQ("EQ");
    s().addNode("Teaching");
    const nodeId = layer().nodes[0]!.id;
    const cellId = layer().nodes[0]!.cells[0]!.id;
    s().addScenario(nodeId, cellId);
    const scId = layer().nodes[0]!.cells[0]!.scenarios[0]!.id;
    s().removeScenario(nodeId, cellId, scId);
    expect(layer().nodes[0]!.cells[0]!.scenarios.length).toBe(0);

    expect(s().restoreDeleted(0).restored).toBe(true);
    expect(layer().nodes[0]!.cells[0]!.scenarios.length).toBe(1);
  });

  it("restores a declined synthesis and clears the synthesisDeclined flag", () => {
    s().createEQ("EQ");
    s().acceptSynthesis();
    s().declineSynthesis();
    expect(doc().overallJudgement).toBeUndefined();
    expect(doc().synthesisDeclined).toBe(true);

    const result = s().restoreDeleted(0);
    expect(result.restored).toBe(true);
    expect(doc().overallJudgement).toBeDefined();
    expect(doc().synthesisDeclined).toBeUndefined();
  });

  it("re-syncs a restored node's cells to the layer's current columns (⚠Q56)", () => {
    s().createEQ("EQ");
    s().addNode("Teaching");
    const nodeId = layer().nodes[0]!.id;
    expect(layer().nodes[0]!.cells.length).toBe(2);
    s().removeNode(nodeId);
    // A column is added while the node sits in the bin.
    s().addColumn("positive");
    expect(layer().continuum.columns.length).toBe(3);

    expect(s().restoreDeleted(0).restored).toBe(true);
    const restored = layer().nodes.find((n) => n.id === nodeId)!;
    // Exactly one cell per current column (Invariant 5) after the re-sync.
    expect(restored.cells.length).toBe(3);
    expect(restored.cells.map((c) => c.columnId).sort()).toEqual(
      layer().continuum.columns.map((c) => c.id).sort(),
    );
  });

  it("refuses to restore a superior node when its layer is gone, keeping it in the bin", () => {
    s().createEQ("EQ");
    s().addSecondMesoLayer("components");
    s().addSuperiorNode("Delivery");
    const supId = superiorLayer(doc())!.nodes[0]!.id;
    s().removeSuperiorNode(supId); // bin[0] = the superior node
    s().removeSecondMesoLayer(); // bin[1] = the whole layer; the node's layer is now gone
    const before = doc().recycleBin.deletedNodes.length;

    const result = s().restoreDeleted(0);
    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/layer/i);
    expect(doc().recycleBin.deletedNodes.length).toBe(before); // still in the bin
  });

  it("returns restored:false for an index that no longer points at an entry", () => {
    s().createEQ("EQ");
    s().addNode("Teaching");
    s().removeNode(layer().nodes[0]!.id);
    expect(s().restoreDeleted(0).restored).toBe(true); // splices the only entry
    expect(s().restoreDeleted(0).restored).toBe(false); // bin now empty
  });
});
