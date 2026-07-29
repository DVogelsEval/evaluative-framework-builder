import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store/store";
import { subordinateLayer } from "./layers";
import { frameworkPlacementForCase } from "./simCaseFold";
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

function buildConditionedSingleNodeFramework() {
  s().createEQ("EQ");
  s().setColumnLabel(layer().continuum.columns[0]!.id, "Weak");
  s().setColumnLabel(layer().continuum.columns[1]!.id, "Strong");
  s().addNode("Teaching quality");
  const node = () => layer().nodes[0]!;
  s().addEvidenceMethod(node().id, { name: "Observation", whatWillBeDone: "x", fitJustification: "y" });
  const methodId = s().doc!.evidenceMethods[0]!.id;
  s().setCellCondition(node().id, node().cells[0]!.id, {
    mode: "boolean",
    booleanLogic: {
      root: {
        type: "TERM",
        term: {
          evidenceElementId: methodId,
          evidenceElementLabel: "[Observation]",
          comparator: "is",
          value: "Strong",
          valueLabel: "Strong",
        },
      },
      plainEnglish: "[Observation] is Strong",
    },
    lastModified: new Date().toISOString(),
  });
  return { node, methodId };
}

describe("frameworkPlacementForCase — single subordinate node", () => {
  it("resolves the node's own conclusion when the case's values satisfy a condition", () => {
    const { node, methodId } = buildConditionedSingleNodeFramework();
    const weakColumnId = node().cells[0]!.columnId;
    // The real key format is `${nodeId}::${termSlotKey}` — the same "global
    // session key" EvidenceValueInputs.tsx builds — NOT a bare termSlotKey.
    const placed = frameworkPlacementForCase(doc(), {
      id: "c1",
      label: "",
      prose: "",
      values: { [`${node().id}::${methodId}`]: "Strong" },
    });
    expect(placed).toBe(weakColumnId);
  });

  it("returns null when no input is given (unknown propagates, never fabricated)", () => {
    buildConditionedSingleNodeFramework();
    const placed = frameworkPlacementForCase(doc(), { id: "c1", label: "", prose: "", values: {} });
    expect(placed).toBeNull();
  });
});

describe("frameworkPlacementForCase — multi-node frameworks", () => {
  it("returns null (not resolvable) when there are multiple subordinate nodes and no Overall Judgement", () => {
    buildConditionedSingleNodeFramework();
    s().addNode("Second criterion");
    const placed = frameworkPlacementForCase(doc(), { id: "c1", label: "", prose: "", values: {} });
    expect(placed).toBeNull();
  });
});
