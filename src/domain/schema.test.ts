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

describe("V2 schema v4 additions (Q63/Q64/Q66)", () => {
  it("accepts a typed warrant object on a cell condition and rejects a bare string", () => {
    const doc = buildCompleteDoc();
    const cell = doc.mesoLayers[0]!.nodes[0]!.cells[0]!;
    cell.condition = {
      mode: "prose",
      proseDescription: "When it converges.",
      lastModified: new Date().toISOString(),
      warrant: { type: "expert", source: "Head of teaching", text: "Because expertise." },
    };
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();

    const legacy = { ...cell, condition: { ...cell.condition, warrant: "a bare string" } };
    expect(
      evaluationQuestionSchema.safeParse({
        ...doc,
        mesoLayers: [{ ...doc.mesoLayers[0]!, nodes: [{ ...doc.mesoLayers[0]!.nodes[0]!, cells: [legacy] }] }],
      }).success,
    ).toBe(false);
  });

  it("accepts type: null (the migrated-legacy state) and requires source/text as strings", () => {
    const doc = buildCompleteDoc();
    const cell = doc.mesoLayers[0]!.nodes[0]!.cells[0]!;
    cell.condition = {
      mode: "prose",
      lastModified: new Date().toISOString(),
      warrant: { type: null, source: "", text: "Migrated text." },
    };
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("accepts an optional distinguishingCase on a cell, absent by default", () => {
    const doc = buildCompleteDoc();
    expect(doc.mesoLayers[0]!.nodes[0]!.cells[0]!.distinguishingCase).toBeUndefined();
    doc.mesoLayers[0]!.nodes[0]!.cells[0]!.distinguishingCase = "Stops short of the next column.";
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("accepts optional Sufficient Bar label/definition on a continuum, absent by default (Q66)", () => {
    const doc = buildCompleteDoc();
    expect(doc.mesoLayers[0]!.continuum.sufficientBarLabel).toBeUndefined();
    doc.mesoLayers[0]!.continuum.sufficientBarLabel = "Good enough to continue funding.";
    doc.mesoLayers[0]!.continuum.sufficientBarDefinition = "Teaching consistently meets need.";
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("requires records[] and rejects a RecordEntry with an empty reason (the whole point of the layer)", () => {
    const doc = buildCompleteDoc();
    expect(doc.records).toEqual([]);
    const badEntry = {
      id: crypto.randomUUID(),
      elementRef: "eq",
      timestamp: new Date().toISOString(),
      author: "Reviewer",
      changeSummary: "Moved the bar.",
      reason: "", // MUST be non-empty
      prompt: "objection" as const,
      includeInExport: true,
    };
    expect(evaluationQuestionSchema.safeParse({ ...doc, records: [badEntry] }).success).toBe(false);
    expect(
      evaluationQuestionSchema.safeParse({ ...doc, records: [{ ...badEntry, reason: "Because." }] })
        .success,
    ).toBe(true);
  });
});

describe("V2 schema v5 additions — SimCase + Critique (Q62/Q65/Q67)", () => {
  it("requires simCases[]/critiques[] and accepts a well-formed SimCase", () => {
    const doc = buildCompleteDoc();
    expect(doc.simCases).toEqual([]);
    expect(doc.critiques).toEqual([]);
    doc.simCases.push({
      id: crypto.randomUUID(),
      label: "Borderline lesson",
      prose: "A lesson with good pacing but no differentiation.",
      values: { someElement: "Good" },
      authorNotes: "Never shown to reviewers.",
      expectedToFail: true,
    });
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("SimCase.values accepts every ComparisonValue shape (strength, pattern, number, boolean, conclusion, null)", () => {
    const doc = buildCompleteDoc();
    doc.simCases.push({
      id: crypto.randomUUID(),
      label: "All value shapes",
      prose: "",
      values: {
        strength: "Strong",
        pattern: "contradiction",
        num: 3,
        bool: true,
        conclusion: { columnId: crypto.randomUUID() },
        none: null,
      },
    });
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("accepts an imported Critique with placements and added cases, disagreements included", () => {
    const doc = buildCompleteDoc();
    doc.critiques.push({
      id: crypto.randomUUID(),
      reviewerLabel: "Reviewer A",
      importedAt: new Date().toISOString(),
      placements: [
        { simCaseId: crypto.randomUUID(), placedAtColumnId: crypto.randomUUID(), objection: "Too harsh." },
      ],
      addedCases: [{ label: "A new one", prose: "Reviewer-authored case." }],
    });
    expect(evaluationQuestionSchema.parse(doc)).toBeTruthy();
  });

  it("no longer accepts the retired comments field shape", () => {
    const doc = buildCompleteDoc();
    const withComments = { ...doc, comments: [{ id: crypto.randomUUID() }] };
    // comments is gone from the schema entirely — zod strips/ignores unknown
    // keys by default, so this asserts the field is simply absent from output,
    // not that providing it fails.
    const parsed = evaluationQuestionSchema.parse(withComments);
    expect((parsed as unknown as { comments?: unknown }).comments).toBeUndefined();
  });
});
