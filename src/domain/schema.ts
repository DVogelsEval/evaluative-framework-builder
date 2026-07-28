import { z } from "zod";

/**
 * Canonical zod schema for the `.evalq.json` document and the Project manifest.
 * SPEC.md Part 1 is the source of truth (R-011/R-012). This is the single I/O
 * boundary schema — every load/save goes through it.
 *
 * Structural validation only: process gates ([gate] invariants, SPEC §8) live in
 * `invariants.ts` so a mid-build document always loads.
 */

export const SCHEMA_VERSION = 3;

/** The Project document's shape is versioned separately from the EQ document.
 *  v2 (owner, 2026-07-25): a Project now *embeds* its Evaluation Questions in
 *  one file — one Save, one Open, no folder of scattered `.evalq.json` files
 *  (see docs/OPEN-QUESTIONS.md Q1 revisit). v1 (a manifest of file refs) still
 *  loads via `migrateProject`. */
export const PROJECT_SCHEMA_VERSION = 2;

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime();

// ---- Question text ----------------------------------------------------------

export const valueSpanSchema = z.object({
  id: uuid,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
});

// ---- Continuum (shared value scale) -----------------------------------------

export const columnSchema = z.object({
  id: uuid,
  label: z.string(), // Column Header, user-authored (R-038)
  ordinal: z.number().int(),
});

export const continuumSchema = z.object({
  id: uuid,
  columns: z.array(columnSchema), // ordered left→right (R-040)
  sufficientBarAfterOrdinal: z.number().int(), // bar sits between columns (R-037)
});

// ---- Evidence tier -----------------------------------------------------------

// A Scenario is prose that can carry inline reference tokens (Q41): the token
// stores the referenced entity's id — Evidence/Method in J10, criterion in the
// J11 synthesis — so the bold name is resolved live, survives a rename, and
// stays traceable for the Evidence Matrix and outputs (Q43, owner-confirmed).
// A synthesis token also carries the clicked column (`atColumnId`, 2026-07-14
// notes — Q44 redirect), rendered "«name» is «Column Header»", both live.
// A "collective" part is the R-110 group reference ("all other" or a custom
// noun) — its label is the user's own and needs no live resolution (Q44).
export const scenarioPartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("token"), targetId: uuid, atColumnId: uuid.optional() }),
  z.object({ kind: z.literal("collective"), label: z.string() }),
]);

export const scenarioSchema = z.object({
  id: uuid,
  order: z.number().int(),
  parts: z.array(scenarioPartSchema), // user-authored prose, tokens inline (Q10, ⚠Q43)
});

export const mixedMethodsTypeSchema = z.enum([
  "convergent",
  "explanatorySequential",
  "exploratorySequential",
  "embedded",
  "multistage",
  "caseStudy",
  "other",
]);

export const subMethodSchema = z.object({
  id: uuid,
  sourceMethodId: uuid,
  mixedMethodsSourceId: uuid,
  retainedAtEvidenceTier: z.boolean(),
});

export const evidenceMethodSchema = z.object({
  id: uuid,
  name: z.string(),
  aim: z.string().optional(),
  whatWillBeDone: z.string().optional(),
  isMixedMethodsSource: z.boolean(),
  mixedMethodsType: mixedMethodsTypeSchema.optional(),
  mixedMethodsCustomName: z.string().optional(), // when type is 'other' (R-167)
  mixedMethodsExplanation: z.string().optional(),
  memberSubMethods: z.array(subMethodSchema).optional(),
  dedupeLinkedIds: z.array(uuid).optional(),
});

export const evidenceLinkSchema = z.object({
  id: uuid,
  evidenceMethodId: uuid,
  criterionId: uuid,
  fitJustification: z.string(), // rewritten per criterion (R-072/R-080)
});

export const evidenceTierRubricSchema = z.object({
  shape: z.literal("rubric"),
  id: uuid,
  criterionId: uuid,
  continuum: continuumSchema,
  methodLevelCells: z.array(
    z.object({
      evidenceMethodId: uuid,
      columnId: uuid,
      description: z.string(),
    }),
  ),
});

export const dataDescriptionListSchema = z.object({
  shape: z.literal("list"),
  id: uuid,
  criterionId: uuid,
  entries: z.array(
    z.object({
      evidenceMethodId: uuid.optional(),
      description: z.string(),
    }),
  ),
});

// Exactly one shape per subordinate node — rubric XOR list (Q13/Q32, Invariant 8).
export const evidenceTierSchema = z.discriminatedUnion("shape", [
  evidenceTierRubricSchema,
  dataDescriptionListSchema,
]);

// ---- Rubric cell conditions (Slice 13, docs/CONDITION-LEXICON.md) ------------
//
// A condition states *when* a rubric cell's conclusion applies, built by
// clicking evidence elements / comparators / values (never automated — the app
// validates and renders it, it never runs it, except the ephemeral Slice-14
// sandbox). The 16 comparators of CONDITION-LEXICON §K are kept as distinct
// enum members so plain-English rendering is a 1:1 map with no element-kind
// lookup at render time.

export const comparatorSchema = z.enum([
  // C.1 strength / rating
  "is",
  "is_not",
  "is_at_or_above",
  "is_above",
  "is_below",
  // C.4 numeric
  "is_exactly",
  "is_at_least",
  "is_more_than",
  "is_fewer_than",
  "is_at_most",
  // C.2 existence (take no value)
  "exists",
  "does_not_exist",
  // C.3 pattern / flag
  "shows",
  "does_not_show",
  "contains",
  "does_not_contain",
]);

// What a term compares against (CONDITION-LEXICON §D). Existence comparators
// need no value and store `null`.
export const comparisonValueSchema = z.union([
  z.enum(["Strong", "Good", "Developing", "Not Yet"]), // D.1 strength
  z.enum(["contradiction", "regression", "inconsistency", "gap", "framework_drift"]), // D.4 patterns
  z.enum(["Rubric", "DataDescriptionList", "Mixed-Method"]), // D.5 tier types
  z.number(), // D.2 clarity 1–5 / counts
  z.boolean(), // D.3 existence flags
  // A resulting-conclusion target: the column a *lower layer's* node resolved to
  // (CONDITION-LEXICON §B.7). Stored as the column's id so it survives a rename;
  // the ordinal comparison resolves the id against the owning layer's column
  // order at evaluation time. Authored only on Overall-Judgement / superior-layer
  // conditions, and evaluated only inside the Slice-14 simulate sandbox.
  z.object({ columnId: uuid }),
  z.null(), // no value (existence comparators)
]);

export const conditionTermSchema = z.object({
  evidenceElementId: z.string(), // stable id (method UUID, or "scenarioClarity" etc.)
  evidenceElementLabel: z.string(), // "[Method A]" — bracketed, resolved at authoring time
  comparator: comparatorSchema,
  value: comparisonValueSchema,
  valueLabel: z.string(), // e.g. "at or above Good", "3"
});

export type Comparator = z.infer<typeof comparatorSchema>;
export type ComparisonValue = z.infer<typeof comparisonValueSchema>;
export type ConditionTerm = z.infer<typeof conditionTermSchema>;

// The boolean AST (CONDITION-LEXICON §A). Recursive, so the zod schema is lazy
// and the TS type is declared explicitly (zod cannot infer a recursive type).
export type BooleanConditionNode =
  | { type: "TERM"; term: ConditionTerm }
  | { type: "AND"; operands: BooleanConditionNode[] }
  | { type: "OR"; operands: BooleanConditionNode[] }
  | { type: "NOT"; operand: BooleanConditionNode };

export const booleanConditionNodeSchema: z.ZodType<BooleanConditionNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("TERM"), term: conditionTermSchema }),
    z.object({ type: z.literal("AND"), operands: z.array(booleanConditionNodeSchema) }),
    z.object({ type: z.literal("OR"), operands: z.array(booleanConditionNodeSchema) }),
    z.object({ type: z.literal("NOT"), operand: booleanConditionNodeSchema }),
  ]),
);

// The stored boolean condition: the AST plus its auto-generated plain English
// and any parse errors / semantic warnings (R-COND-9). Errors never block save
// — they are shown to the user (warnings are informational).
export const booleanConditionTreeSchema = z.object({
  root: booleanConditionNodeSchema,
  plainEnglish: z.string(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

// A defeasible qualifier / warrant field may hold either a built boolean tree
// or freeform prose (R-COND-6).
const booleanOrProse = z.union([booleanConditionTreeSchema, z.string()]);

export const rubricCellConditionSchema = z.object({
  mode: z.enum(["boolean", "prose"]), // the active representation (R-COND-7)
  booleanLogic: booleanConditionTreeSchema.optional(),
  proseDescription: z.string().optional(),
  // Defeasible qualifiers (R-COND-6) — all optional, mode-agnostic.
  typicallyWhen: booleanOrProse.optional(),
  unless: z
    .object({
      condition: booleanOrProse,
      action: z.enum(["suggest_weaker", "downgrade", "block"]),
    })
    .optional(),
  exception: z
    .object({
      condition: booleanOrProse,
      action: z.enum(["block", "reconsider"]),
    })
    .optional(),
  warrant: z.string().optional(), // Toulmin backing, freeform
  lastModified: isoDateTime,
});

export type BooleanConditionTree = z.infer<typeof booleanConditionTreeSchema>;
export type RubricCellCondition = z.infer<typeof rubricCellConditionSchema>;

// ---- Meso tier ---------------------------------------------------------------

export const cellSchema = z.object({
  id: uuid,
  columnId: uuid,
  included: z.boolean(), // open vs greyed-out; the single stored truth of reach (Q6)
  plainDescription: z.string().optional(),
  scenarios: z.array(scenarioSchema),
  clarityRating: z.number().int().min(1).max(5).optional(),
  clarityNote: z.string().optional(),
  // When this cell's conclusion applies — Slice 13 (R-COND-8). Optional: absent
  // means no condition authored yet (equivalent to empty prose).
  condition: rubricCellConditionSchema.optional(),
});

// Qualitative importance/reach mark — never a numeric weight (Q11). One per
// column; `reach` pre-sets the matching Cell's `included` default (Q6, R-054).
export const importanceMarkSchema = z.object({
  columnId: uuid,
  reach: z.boolean(),
});

export const mesoNodeSchema = z.object({
  id: uuid,
  name: z.string(),
  order: z.number().int(),
  parentNodeId: uuid.optional(),
  linkToQuestion: z.string(),
  linkToValues: z.string(),
  decisionsOrUse: z.string(),
  importance: z.array(importanceMarkSchema).optional(), // seeds cell defaults (Q6) — R-054
  cells: z.array(cellSchema), // one per Column of the layer's continuum (R-145)
  evidenceLinks: z.array(evidenceLinkSchema),
  evidenceTier: evidenceTierSchema.optional(), // mandatory at the evidence gate, absent mid-build
  // The J9 mixed-methods step was completed or declined for this node — the
  // per-node done-or-declined record Q20's unlock predicate needs (R-162–R-164).
  mixedMethodsResolved: z.boolean().optional(),
  // R-168: the note saved in the sub-methods space when existing sources are
  // themselves mixed-methods (no sub-method copies are created for these).
  subMethodsNote: z.string().optional(),
});

export const mesoLayerSchema = z.object({
  id: uuid,
  kind: z.enum(["criteria", "components"]), // drives the UI label only (R-048/Q15)
  tierOrder: z.number().int(), // 0 = subordinate (owns the evidence tier) — Q33
  continuum: continuumSchema, // one shared scale per layer (Q30)
  nodes: z.array(mesoNodeSchema),
  reviewConfirmed: z.boolean().optional(), // full-rubric review done (J6) — R-067
});

// ---- Overall Judgement (synthesis, J11) ---------------------------------------

// One evidence combination that yields a judgement column (R-107): the same
// token-bearing prose as a criterion Scenario, but its tokens name meso nodes
// and it may carry collective group parts (R-108/R-110, Q41/⚠Q44).
export const judgementScenarioSchema = z.object({
  id: uuid,
  order: z.number().int(),
  yieldsColumnId: uuid, // the judgement column this combination triggers
  parts: z.array(scenarioPartSchema),
});

/**
 * The optional synthesis rubric (R-098). Rows top→bottom (Q16): Header row =
 * the continuum's column labels; Decision row (toggleable — R-102/⚠Q46);
 * Final judgement (plain description) — R-104; Final judgement (criterion
 * conditions) = the scenarios. Decision/plain-description cells are upserted —
 * only real content is stored. `freeTextOverride` is the R-112 escape hatch:
 * the user may plain-text the whole synthesis instead (⚠Q45).
 */
export const overallJudgementSchema = z.object({
  id: uuid,
  continuum: continuumSchema, // own scale, seeded from value language (R-100/R-101)
  decisionRowEnabled: z.boolean(),
  decisionCells: z.array(z.object({ columnId: uuid, text: z.string() })),
  plainDescriptionCells: z.array(z.object({ columnId: uuid, text: z.string() })),
  scenarios: z.array(judgementScenarioSchema),
  // Optional per-column Boolean condition (Slice 14, owner Q61): the synthesis
  // may express *when* each Overall-Judgement column applies as a click-built
  // Boolean condition over the top meso layer's node conclusions — the same
  // builder the criterion layer offers, alongside (not replacing) the prose
  // scenarios above. Absent columns simply have no Boolean condition. Only read
  // by the ephemeral simulate sandbox; never executed in the real flow.
  conditionCells: z
    .array(z.object({ columnId: uuid, condition: rubricCellConditionSchema }))
    .optional(),
  freeTextOverride: z.string().optional(),
});

// ---- Cross-cutting -----------------------------------------------------------

export const changeLogEntrySchema = z.object({
  id: uuid,
  nodeId: uuid.optional(),
  timestamp: isoDateTime,
  note: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export const recycleBinSchema = z.object({
  deletedNodes: z.array(
    z.object({
      node: z.unknown(),
      deletedAt: isoDateTime,
      originPath: z.string(),
    }),
  ),
});

// Present-but-unused stub for the v2 critique/fork path (Arch §9).
export const commentSchema = z.object({
  id: uuid,
  nodeId: uuid.optional(),
  authorLabel: z.string(),
  text: z.string(),
  createdAt: isoDateTime,
});

// ---- The on-disk documents ---------------------------------------------------

/** The savable/openable unit — one EQ = one `.evalq.json` (Q1/Q2). */
export const evaluationQuestionSchema = z.object({
  id: uuid,
  title: z.string(),
  questionText: z.string(),
  valueLanguage: z.array(valueSpanSchema).optional(),
  notes: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  mesoLayers: z.array(mesoLayerSchema).min(1).max(2), // two meso layers max (Q3/Q33)
  evidenceMethods: z.array(evidenceMethodSchema), // per-EQ shared pool (R-079)
  overallJudgement: overallJudgementSchema.optional(), // optional synthesis (R-098)
  // The J11 choice was declined — the done-or-declined record the Q20 unlock
  // predicate needs (mirrors mixedMethodsResolved). Accepting clears it.
  synthesisDeclined: z.boolean().optional(),
  recycleBin: recycleBinSchema,
  changeLog: z.array(changeLogEntrySchema),
  comments: z.array(commentSchema),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/**
 * A Project is the single savable/openable file (Q1, revised 2026-07-25): it
 * **embeds** its Evaluation Questions rather than pointing at separate files, so
 * the user opens one file and picks a question from within it. (`ProjectManifest`
 * keeps its name to avoid churn, but it is now a full container, not a manifest.)
 */
export const projectManifestSchema = z.object({
  id: uuid,
  name: z.string(),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  evaluationQuestions: z.array(evaluationQuestionSchema),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type ValueSpan = z.infer<typeof valueSpanSchema>;
export type Column = z.infer<typeof columnSchema>;
export type Continuum = z.infer<typeof continuumSchema>;
export type ScenarioPart = z.infer<typeof scenarioPartSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type JudgementScenario = z.infer<typeof judgementScenarioSchema>;
export type OverallJudgement = z.infer<typeof overallJudgementSchema>;
export type MixedMethodsType = z.infer<typeof mixedMethodsTypeSchema>;
export type SubMethod = z.infer<typeof subMethodSchema>;
export type EvidenceMethod = z.infer<typeof evidenceMethodSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type EvidenceTierRubric = z.infer<typeof evidenceTierRubricSchema>;
export type DataDescriptionList = z.infer<typeof dataDescriptionListSchema>;
export type EvidenceTier = z.infer<typeof evidenceTierSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type ImportanceMark = z.infer<typeof importanceMarkSchema>;
export type MesoNode = z.infer<typeof mesoNodeSchema>;
export type MesoLayer = z.infer<typeof mesoLayerSchema>;
export type ChangeLogEntry = z.infer<typeof changeLogEntrySchema>;
export type RecycleBin = z.infer<typeof recycleBinSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type EvaluationQuestion = z.infer<typeof evaluationQuestionSchema>;
export type ProjectManifest = z.infer<typeof projectManifestSchema>;
