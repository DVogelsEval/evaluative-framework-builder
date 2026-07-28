import { describe, expect, it } from "vitest";
import { toPlainEnglish } from "./BooleanParser";
import {
  createDataDescriptionList,
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createEvidenceTierRubric,
  createMesoNode,
} from "./factory";
import { canSimulate } from "./simulateGating";
import type { BooleanConditionNode, MesoNode, RubricCellCondition } from "./schema";

const cond = (root: BooleanConditionNode): RubricCellCondition => ({
  mode: "boolean",
  booleanLogic: { root, plainEnglish: toPlainEnglish(root) },
  lastModified: new Date().toISOString(),
});

/** A subordinate node with a linked method + a rubric tier + a Boolean condition
 *  on its top cell — a node that passes the gate. */
function qualifyingNode(doc: ReturnType<typeof createEvaluationQuestion>, name: string): MesoNode {
  const layer = doc.mesoLayers[0]!;
  const node = createMesoNode(layer, name);
  const method = createEvidenceMethod("Observation");
  doc.evidenceMethods.push(method);
  node.evidenceLinks.push(createEvidenceLink(method.id, node.id, ""));
  node.evidenceTier = createEvidenceTierRubric(node.id);
  node.cells[node.cells.length - 1]!.condition = cond({
    type: "TERM",
    term: {
      evidenceElementId: method.id,
      evidenceElementLabel: `[${method.name}]`,
      comparator: "is",
      value: "Strong",
      valueLabel: "Strong",
    },
  });
  layer.nodes.push(node);
  return node;
}

describe("canSimulate", () => {
  it("allows a fully rubric-and-conditioned framework", () => {
    const doc = createEvaluationQuestion("q");
    qualifyingNode(doc, "A");
    qualifyingNode(doc, "B");
    const result = canSimulate(doc);
    expect(result.allowed).toBe(true);
    expect(result.blockingNodes).toHaveLength(0);
  });

  it("blocks and names a node that uses a Data Description List (R-SIM-1)", () => {
    const doc = createEvaluationQuestion("q");
    qualifyingNode(doc, "A");
    const ddlNode = createMesoNode(doc.mesoLayers[0]!, "Clarity of Argument");
    const method = createEvidenceMethod("Interviews");
    doc.evidenceMethods.push(method);
    ddlNode.evidenceLinks.push(createEvidenceLink(method.id, ddlNode.id, ""));
    ddlNode.evidenceTier = createDataDescriptionList(ddlNode.id);
    doc.mesoLayers[0]!.nodes.push(ddlNode);

    const result = canSimulate(doc);
    expect(result.allowed).toBe(false);
    expect(result.blockingNodes).toHaveLength(1);
    expect(result.blockingNodes[0]!.nodeName).toBe("Clarity of Argument");
    expect(result.blockingNodes[0]!.reason).toContain("Data Description List");
  });

  it("blocks a rubric node that has no Boolean condition", () => {
    const doc = createEvaluationQuestion("q");
    const node = createMesoNode(doc.mesoLayers[0]!, "Uncoditioned");
    const method = createEvidenceMethod("Observation");
    doc.evidenceMethods.push(method);
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, ""));
    node.evidenceTier = createEvidenceTierRubric(node.id);
    doc.mesoLayers[0]!.nodes.push(node); // no condition on any cell
    const result = canSimulate(doc);
    expect(result.allowed).toBe(false);
    expect(result.blockingNodes[0]!.reason).toContain("Boolean condition");
  });

  it("is not allowed for an empty framework", () => {
    const doc = createEvaluationQuestion("q");
    expect(canSimulate(doc).allowed).toBe(false);
  });
});
