import { describe, expect, it } from "vitest";
import {
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createEvidenceTierRubric,
  createMesoNode,
} from "./factory";
import { MigrationError, migrateEvaluationQuestion } from "./migrate";
import { evaluationQuestionSchema } from "./schema";

describe("migration chain (R-012)", () => {
  it("passes a current-version document through unchanged", () => {
    const doc = JSON.parse(JSON.stringify(createEvaluationQuestion("EQ")));
    expect(migrateEvaluationQuestion(doc)).toEqual(doc);
  });

  it("v1 → v2: scenario description + reference chips fold into token-bearing parts (Q41/⚠Q43)", () => {
    // A current doc, downgraded by hand to the v1 Scenario shape.
    const doc = createEvaluationQuestion("EQ");
    doc.questionText = "How good is it?";
    const layer = doc.mesoLayers[0]!;
    const node = createMesoNode(layer, "Quality");
    layer.nodes.push(node);
    const method = createEvidenceMethod("Classroom observation");
    doc.evidenceMethods.push(method);
    node.evidenceLinks.push(createEvidenceLink(method.id, node.id, "Fits."));
    const rubric = createEvidenceTierRubric(node.id);
    rubric.continuum.columns[1]!.label = "Strong";
    node.evidenceTier = rubric;

    const raw = JSON.parse(JSON.stringify(doc)) as {
      schemaVersion: number;
      mesoLayers: { nodes: { cells: { scenarios: unknown[] }[] }[] }[];
    };
    raw.schemaVersion = 1;
    raw.mesoLayers[0]!.nodes[0]!.cells[0]!.scenarios.push({
      id: crypto.randomUUID(),
      order: 0,
      description: "Observation notes place the teaching here.",
      evidenceRefs: [
        {
          evidenceMethodId: method.id,
          atLevelColumnId: rubric.continuum.columns[1]!.id,
          note: "ten strong lessons",
        },
      ],
    });
    raw.mesoLayers[0]!.nodes[0]!.cells[1]!.scenarios.push({
      id: crypto.randomUUID(),
      order: 0,
      description: "",
      evidenceRefs: [],
    });

    const parsed = evaluationQuestionSchema.parse(migrateEvaluationQuestion(raw));
    // The chain runs all the way to current (v1 → v2 → v3).
    expect(parsed.schemaVersion).toBe(3);
    // The chip's level pick and note fold into the prose after the token —
    // nothing the user authored is dropped.
    expect(parsed.mesoLayers[0]!.nodes[0]!.cells[0]!.scenarios[0]!.parts).toEqual([
      { kind: "text", text: "Observation notes place the teaching here.\n" },
      { kind: "token", targetId: method.id },
      { kind: "text", text: ' at "Strong" — ten strong lessons' },
    ]);
    expect(parsed.mesoLayers[0]!.nodes[0]!.cells[1]!.scenarios[0]!.parts).toEqual([]);
  });

  it("v2 → v3: existing rubric cells default to a Prose-mode condition (Slice 13, R-COND-8)", () => {
    const doc = createEvaluationQuestion("EQ");
    const layer = doc.mesoLayers[0]!;
    layer.nodes.push(createMesoNode(layer, "Quality"));

    const raw = JSON.parse(JSON.stringify(doc)) as {
      schemaVersion: number;
      mesoLayers: { nodes: { cells: { condition?: unknown }[] }[] }[];
    };
    raw.schemaVersion = 2;
    // v2 cells carry no `condition` field.
    for (const cell of raw.mesoLayers[0]!.nodes[0]!.cells) delete cell.condition;

    const parsed = evaluationQuestionSchema.parse(migrateEvaluationQuestion(raw));
    expect(parsed.schemaVersion).toBe(3);
    for (const cell of parsed.mesoLayers[0]!.nodes[0]!.cells) {
      expect(cell.condition?.mode).toBe("prose");
      expect(cell.condition?.booleanLogic).toBeUndefined();
    }
  });

  it("rejects a document with no schemaVersion at the root", () => {
    expect(() => migrateEvaluationQuestion({ title: "no version" })).toThrow(MigrationError);
  });

  it("rejects a document from a newer schema than this app supports", () => {
    expect(() => migrateEvaluationQuestion({ schemaVersion: 999 })).toThrow(MigrationError);
  });

  it("rejects non-object input", () => {
    expect(() => migrateEvaluationQuestion("not a document")).toThrow(MigrationError);
    expect(() => migrateEvaluationQuestion([1, 2])).toThrow(MigrationError);
  });
});
