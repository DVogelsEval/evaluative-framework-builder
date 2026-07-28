import { describe, expect, it } from "vitest";
import {
  createDataDescriptionList,
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createMesoNode,
  createProjectManifest,
} from "./factory";
import {
  evaluationQuestionSchema,
  evidenceTierSchema,
  projectManifestSchema,
} from "./schema";
import { stableStringify } from "./serialize";

function buildCompleteDoc() {
  const doc = createEvaluationQuestion("Reading program quality");
  doc.questionText = "How good is the reading program?";
  const layer = doc.mesoLayers[0]!;
  layer.continuum.columns[0]!.label = "Insufficient";
  layer.continuum.columns[1]!.label = "Sufficient";
  const node = createMesoNode(layer, "Teaching quality");
  for (const cell of node.cells) cell.plainDescription = "Described.";
  layer.nodes.push(node);
  const method = createEvidenceMethod("Classroom observation");
  doc.evidenceMethods.push(method);
  node.evidenceLinks.push(createEvidenceLink(method.id, node.id, "Directly observes teaching."));
  const list = createDataDescriptionList(node.id);
  list.entries.push({ evidenceMethodId: method.id, description: "Observation notes." });
  node.evidenceTier = list;
  return doc;
}

describe("canonical .evalq.json schema (R-011/R-012)", () => {
  it("accepts a factory-created walking-skeleton document", () => {
    expect(evaluationQuestionSchema.parse(buildCompleteDoc())).toBeTruthy();
  });

  it("accepts a mid-build document (no nodes, no evidence tier yet)", () => {
    expect(evaluationQuestionSchema.parse(createEvaluationQuestion("Draft"))).toBeTruthy();
  });

  it("rejects a document without the current schemaVersion at the root", () => {
    const doc = { ...buildCompleteDoc(), schemaVersion: 999 };
    expect(evaluationQuestionSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects more than two meso layers (Invariant 18 / Q3)", () => {
    const doc = buildCompleteDoc();
    const layer = doc.mesoLayers[0]!;
    const raw = {
      ...doc,
      mesoLayers: [layer, { ...layer, id: crypto.randomUUID() }, { ...layer, id: crypto.randomUUID() }],
    };
    expect(evaluationQuestionSchema.safeParse(raw).success).toBe(false);
  });

  it("round-trips through pretty-printed key-ordered JSON identically", () => {
    const doc = buildCompleteDoc();
    const reloaded = evaluationQuestionSchema.parse(JSON.parse(stableStringify(doc)));
    expect(reloaded).toEqual(doc);
  });

  it("evidence tier is rubric XOR list via the shape discriminator (Q13/Q32)", () => {
    const list = createDataDescriptionList(crypto.randomUUID());
    expect(evidenceTierSchema.parse(list).shape).toBe("list");
    expect(
      evidenceTierSchema.safeParse({ ...list, shape: "somethingElse" }).success,
    ).toBe(false);
  });
});

describe("Project schema (Q1, revised 2026-07-25 — embeds its EQs)", () => {
  it("accepts a factory-created Project with embedded EQs and round-trips", () => {
    const project = createProjectManifest("Demo Project");
    project.evaluationQuestions.push(createEvaluationQuestion("EQ 1"));
    const reloaded = projectManifestSchema.parse(JSON.parse(stableStringify(project)));
    expect(reloaded).toEqual(project);
  });
});
