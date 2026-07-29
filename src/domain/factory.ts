import { seedHeadersFromValueLanguage } from "./continuum";
import {
  PROJECT_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type Cell,
  type ComparisonValue,
  type Continuum,
  type DataDescriptionList,
  type EvaluationQuestion,
  type EvidenceLink,
  type EvidenceMethod,
  type EvidenceTierRubric,
  type JudgementScenario,
  type MesoLayer,
  type MesoNode,
  type OverallJudgement,
  type ProjectManifest,
  type Scenario,
  type SimCase,
  type ValueSpan,
} from "./schema";

/** UUIDs are assigned once at creation and never reused (R-013, Invariant 1). */
const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

export function createProjectManifest(name: string): ProjectManifest {
  const ts = now();
  return {
    id: newId(),
    name,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    evaluationQuestions: [], // EQs are embedded here (revised Q1, 2026-07-25)
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * A minimal continuum: one negative + one positive column around the Sufficient
 * Bar (Q7 — ≥1 each side is mandatory). Headers start empty for the user to author.
 */
export function createMinimalContinuum(): Continuum {
  return {
    id: newId(),
    columns: [
      { id: newId(), label: "", ordinal: 1 },
      { id: newId(), label: "", ordinal: 2 },
    ],
    sufficientBarAfterOrdinal: 1,
  };
}

/** A highlighted value-language span within the question text (R-034). */
export function createValueSpan(start: number, end: number, text: string): ValueSpan {
  return { id: newId(), start, end, text };
}

/** An empty prose Scenario for a cell's Evidence row (J10, R-087/R-089). */
export function createScenario(order: number): Scenario {
  return { id: newId(), order, parts: [] };
}

export function createEvaluationQuestion(title: string): EvaluationQuestion {
  const ts = now();
  return {
    id: newId(),
    title,
    questionText: "",
    schemaVersion: SCHEMA_VERSION,
    mesoLayers: [
      {
        id: newId(),
        kind: "criteria",
        tierOrder: 0, // subordinate layer — owns the evidence tier (Q33)
        continuum: createMinimalContinuum(),
        nodes: [],
      },
    ],
    evidenceMethods: [],
    recycleBin: { deletedNodes: [] },
    records: [],
    simCases: [],
    critiques: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * One rubric row: exactly one cell per column of the layer's continuum (R-145,
 * Invariant 5). Fields start empty (GWT-4.1); importance marks default to
 * full reach, so every cell opens by default (Q6 — "the default being on").
 */
export function createMesoNode(layer: MesoLayer, name = ""): MesoNode {
  const cells: Cell[] = layer.continuum.columns.map((column) => ({
    id: newId(),
    columnId: column.id,
    included: true, // default on (Q6)
    scenarios: [],
  }));
  return {
    id: newId(),
    name,
    order: layer.nodes.length,
    linkToQuestion: "",
    linkToValues: "",
    decisionsOrUse: "",
    importance: layer.continuum.columns.map((column) => ({
      columnId: column.id,
      reach: true,
    })),
    cells,
    evidenceLinks: [],
  };
}

/**
 * A second (superior) meso layer grown above the subordinate one (Slice 7,
 * R-045/R-046, Q3/Q4/Q33). It starts empty — its own minimal continuum for the
 * user to author, no nodes yet — and always sits at `tierOrder` 1, so the
 * subordinate layer (tierOrder 0) keeps its evidence tier (Q33). The superior
 * layer is what the Overall Judgement synthesises (Q4).
 */
export function createSecondMesoLayer(kind: MesoLayer["kind"]): MesoLayer {
  return {
    id: newId(),
    kind,
    tierOrder: 1, // superior — sits above the subordinate evidence-owning layer
    continuum: createMinimalContinuum(),
    nodes: [],
  };
}

export function createEvidenceMethod(
  name: string,
  whatWillBeDone?: string,
): EvidenceMethod {
  return {
    id: newId(),
    name,
    ...(whatWillBeDone !== undefined ? { whatWillBeDone } : {}),
    isMixedMethodsSource: false,
  };
}

export function createEvidenceLink(
  evidenceMethodId: string,
  criterionId: string,
  fitJustification: string,
): EvidenceLink {
  return {
    id: newId(),
    evidenceMethodId,
    criterionId,
    fitJustification,
  };
}

/**
 * A combined mixed-methods source (R-169–R-173): a new Evidence/Method at the
 * evidence tier whose members are copied one tier below as SubMethods, each
 * retained at the evidence tier until the user says otherwise (R-174, Q27/Q38).
 * The type/explanation are stored once on the source (Q28) and are gated by
 * Invariant 12 before the step completes, not at creation.
 */
export function createMixedMethodsSource(
  name: string,
  memberMethodIds: string[],
): EvidenceMethod {
  const sourceId = newId();
  return {
    id: sourceId,
    name,
    isMixedMethodsSource: true,
    memberSubMethods: memberMethodIds.map((methodId) => ({
      id: newId(),
      sourceMethodId: methodId,
      mixedMethodsSourceId: sourceId,
      retainedAtEvidenceTier: true, // non-destructive default (R-174)
    })),
  };
}

/**
 * The optional synthesis rubric (J11, R-098): its own continuum starting two
 * columns each side of the Sufficient Bar (R-101), headers seeded from the
 * question's value language but freely re-authorable (R-100, Q34 pattern).
 * The Decision row starts present — it "can be removed or added" (R-102/⚠Q46).
 */
export function createOverallJudgement(valueLanguage: ValueSpan[]): OverallJudgement {
  const continuum: Continuum = {
    id: newId(),
    columns: [1, 2, 3, 4].map((ordinal) => ({ id: newId(), label: "", ordinal })),
    sufficientBarAfterOrdinal: 2,
  };
  return {
    id: newId(),
    continuum: seedHeadersFromValueLanguage(continuum, valueLanguage),
    decisionRowEnabled: true,
    decisionCells: [],
    plainDescriptionCells: [],
    scenarios: [],
  };
}

/** An empty criterion-conditions Scenario for a judgement column (R-107). */
export function createJudgementScenario(
  order: number,
  yieldsColumnId: string,
): JudgementScenario {
  return { id: newId(), order, yieldsColumnId, parts: [] };
}

export function createDataDescriptionList(criterionId: string): DataDescriptionList {
  return {
    shape: "list",
    id: newId(),
    criterionId,
    entries: [],
  };
}

/**
 * The nested evidence-tier rubric (R-075): its own minimal continuum for the
 * collective evidence set, headers blank for the user to author, with per-
 * method level descriptions filled in against its columns.
 */
export function createEvidenceTierRubric(criterionId: string): EvidenceTierRubric {
  return {
    shape: "rubric",
    id: newId(),
    criterionId,
    continuum: createMinimalContinuum(),
    methodLevelCells: [],
  };
}

/**
 * A persisted hypothetical case (V2 Phase 2, Q62/Q67): `values` captures the
 * Simulate Judgement sandbox's current session inputs verbatim — keyed
 * `${nodeId}::${termSlotKey}`, same as `EvidenceValueInputs.tsx` builds and
 * `simulateEvaluate.ts` expects — the caller passes whatever it already
 * has; this factory does not touch the sandbox.
 */
export function createSimCase(
  label: string,
  prose: string,
  values: Record<string, ComparisonValue>,
): SimCase {
  return { id: newId(), label, prose, values };
}
