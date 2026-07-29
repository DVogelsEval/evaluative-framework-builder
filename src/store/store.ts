import { create } from "zustand";
import {
  addColumn as addColumnTo,
  removeColumn as removeColumnFrom,
  seedHeadersFromValueLanguage,
  type ContinuumSide,
} from "../domain/continuum";
import {
  createDataDescriptionList,
  createEvaluationQuestion,
  createEvidenceLink,
  createEvidenceMethod,
  createEvidenceTierRubric,
  createJudgementScenario,
  createMesoNode,
  createMixedMethodsSource,
  createOverallJudgement,
  createProjectManifest,
  createScenario,
  createSecondMesoLayer,
  createSimCase,
  createValueSpan,
} from "../domain/factory";
import { superiorLayer as findSuperiorLayer } from "../domain/layers";
import { canExcludeCell } from "../domain/meso";
import { restoreDeletedItem, type RestoreResult } from "../domain/recycleBin";
import { critiqueSchema } from "../domain/schema";
import { firstIncompleteView } from "./wizard";
import type {
  ComparisonValue,
  Continuum,
  EvaluationQuestion,
  MesoLayer,
  MesoNode,
  MixedMethodsType,
  ProjectManifest,
  RecordEntry,
  RubricCellCondition,
  ScenarioPart,
  SimCase,
} from "../domain/schema";

/**
 * The document IS the state; this store is a thin editable wrapper over it
 * (ARCHITECTURE §2). Every mutation clones the document, applies one change,
 * and stamps `updatedAt`.
 */

export type View =
  | "start"
  | "question"
  | "continuum"
  | "structure"
  | "nodes"
  | "criterion"
  | "review"
  | "evidence"
  | "mixed"
  | "connect"
  | "secondlayer"
  | "synthesis"
  | "home"
  | "outputs"
  | "aihandoff"
  | "simulate"
  | "deleted"
  | "records"
  | "critiques"
  | "criteriontimeline";

/** The three per-node warrant fields (R-050–R-052) plus the name (R-153). */
export type NodeTextField =
  | "name"
  | "linkToQuestion"
  | "linkToValues"
  | "decisionsOrUse";

export interface AppState {
  project: ProjectManifest | null;
  doc: EvaluationQuestion | null;
  view: View;
  /** Node the J5 editor should open on (set by Review/Home row clicks — R-066). */
  focusNodeId: string | null;
  /** Where the evidence step should return after a J10 add-evidence re-entry —
   *  the R-094/R-095 "subset of steps" hand-back. Transient, never persisted. */
  evidenceReturnTo: "connect" | null;

  createProject: (name: string) => void;
  createEQ: (title: string) => void;
  /** Open one of the current Project's embedded EQs as the active document. */
  openEvaluationQuestion: (eqId: string) => void;
  setView: (view: View) => void;
  openNodeEditor: (nodeId: string) => void;
  setQuestionText: (text: string) => void;
  addValueSpan: (start: number, end: number, text: string) => void;
  removeValueSpan: (id: string) => void;
  seedContinuumFromValueLanguage: () => void;
  setColumnLabel: (columnId: string, label: string) => void;
  addColumn: (side: ContinuumSide) => void;
  removeColumn: (columnId: string) => void;
  setLayerKind: (kind: MesoLayer["kind"]) => void;
  addNode: (name?: string) => void;
  updateNodeField: (nodeId: string, field: NodeTextField, value: string) => void;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, direction: -1 | 1) => void;
  setImportanceReach: (nodeId: string, columnId: string, reach: boolean) => void;
  confirmRubricReview: () => void;
  setCellPlainDescription: (nodeId: string, cellId: string, text: string) => void;
  setCellDistinguishingCase: (nodeId: string, cellId: string, text: string) => void;
  toggleCellIncluded: (nodeId: string, cellId: string) => void;
  addEvidenceMethod: (
    nodeId: string,
    input: { name: string; whatWillBeDone: string; fitJustification: string },
  ) => void;
  reuseEvidenceMethod: (nodeId: string, methodId: string) => void;
  updateEvidenceMethod: (
    methodId: string,
    field: "name" | "aim" | "whatWillBeDone",
    value: string,
  ) => void;
  updateFitJustification: (nodeId: string, linkId: string, text: string) => void;
  removeEvidenceLink: (nodeId: string, linkId: string) => void;
  linkMethodsAsSame: (methodIdA: string, methodIdB: string) => void;
  unlinkMethods: (methodIdA: string, methodIdB: string) => void;
  chooseEvidenceTier: (nodeId: string, shape: "rubric" | "list") => void;
  setDataDescription: (nodeId: string, methodId: string, text: string) => void;
  updateDataEntry: (
    nodeId: string,
    index: number,
    patch: { evidenceMethodId?: string; description?: string },
  ) => void;
  removeDataEntry: (nodeId: string, index: number) => void;
  setEvidenceColumnLabel: (nodeId: string, columnId: string, label: string) => void;
  addEvidenceColumn: (nodeId: string, side: ContinuumSide) => void;
  removeEvidenceColumn: (nodeId: string, columnId: string) => void;
  setMethodLevelDescription: (
    nodeId: string,
    methodId: string,
    columnId: string,
    text: string,
  ) => void;
  combineMethods: (
    nodeId: string,
    memberMethodIds: string[],
    input: {
      name: string;
      type: MixedMethodsType;
      customName?: string;
      explanation: string;
    },
  ) => void;
  setMixedMethodsType: (methodId: string, type: MixedMethodsType) => void;
  setMixedMethodsCustomName: (methodId: string, name: string) => void;
  setMixedMethodsExplanation: (methodId: string, text: string) => void;
  tickMethodAsMixed: (methodId: string, ticked: boolean) => void;
  setSubMethodRetention: (nodeId: string, subMethodId: string, retained: boolean) => void;
  resolveMixedMethods: (nodeId: string, note?: string) => void;
  addScenario: (nodeId: string, cellId: string) => void;
  updateScenarioParts: (
    nodeId: string,
    cellId: string,
    scenarioId: string,
    parts: ScenarioPart[],
  ) => void;
  removeScenario: (nodeId: string, cellId: string, scenarioId: string) => void;
  setCellClarity: (nodeId: string, cellId: string, rating: number) => void;
  setCellClarityNote: (nodeId: string, cellId: string, text: string) => void;
  /** Save a cell's applicability condition (Slice 13, R-COND-8). Stamps
   *  `lastModified`; autosave to localStorage follows from the doc change. */
  setCellCondition: (
    nodeId: string,
    cellId: string,
    condition: RubricCellCondition,
  ) => void;
  beginEvidenceReentry: (nodeId: string) => void;
  // ---- Slice 7: second meso layer (R-045–R-047, Q3/Q4/Q33) -----------------
  addSecondMesoLayer: (kind: MesoLayer["kind"]) => void;
  removeSecondMesoLayer: () => void;
  addSuperiorNode: (name?: string) => void;
  renameSuperiorNode: (nodeId: string, name: string) => void;
  removeSuperiorNode: (nodeId: string) => void;
  addSuperiorColumn: (side: ContinuumSide) => void;
  removeSuperiorColumn: (columnId: string) => void;
  setNodeParent: (nodeId: string, parentNodeId: string | null) => void;
  // Inter-layer connect pass (Q53/Q54): conditional statements on superior-layer
  // nodes whose tokens name subordinate nodes — J10 "up" a layer.
  addSuperiorScenario: (nodeId: string, cellId: string) => void;
  updateSuperiorScenarioParts: (
    nodeId: string,
    cellId: string,
    scenarioId: string,
    parts: ScenarioPart[],
  ) => void;
  removeSuperiorScenario: (nodeId: string, cellId: string, scenarioId: string) => void;
  acceptSynthesis: () => void;
  declineSynthesis: () => void;
  setJudgementColumnLabel: (columnId: string, label: string) => void;
  addJudgementColumn: (side: ContinuumSide) => void;
  removeJudgementColumn: (columnId: string) => void;
  toggleDecisionRow: () => void;
  setDecisionCellText: (columnId: string, text: string) => void;
  setJudgementPlainDescription: (columnId: string, text: string) => void;
  addJudgementScenario: (columnId: string) => void;
  removeJudgementScenario: (scenarioId: string) => void;
  updateJudgementScenarioParts: (scenarioId: string, parts: ScenarioPart[]) => void;
  /** Save (or clear) a judgement column's Boolean/prose condition (Slice 14,
   *  Q61). Upserts into `overallJudgement.conditionCells`; passing `null`
   *  removes the column's condition. Only read by the simulate sandbox. */
  setJudgementCondition: (columnId: string, condition: RubricCellCondition | null) => void;
  setSynthesisFreeText: (text: string) => void;
  setNotes: (text: string) => void;
  /** V2 record layer (docs/ROADMAP-V2.md §1.3, Q64). Reasoned changes only —
   *  never called automatically from a mutation; a view offers the prompt
   *  after calling the mutating action, and only saves it on explicit submit
   *  (see src/views/useRecordPrompt.ts). `id`/`timestamp` are stamped here. */
  addRecordEntry: (entry: {
    elementRef: string;
    author: string;
    changeSummary: string;
    reason: string;
    prompt: RecordEntry["prompt"];
    previousValue?: string;
    newValue?: string;
    includeInExport?: boolean;
  }) => void;
  updateRecordEntry: (id: string, patch: Partial<RecordEntry>) => void;
  /** Excluding an entry from export is a deliberate per-entry act (R-ROADMAP §1.4). */
  setRecordIncludeInExport: (id: string, include: boolean) => void;
  /** Deletions go to the RecycleBin, never a hard delete (CLAUDE.md). */
  removeRecordEntry: (id: string) => void;
  /** V2 review loop (docs/ROADMAP-V2.md §2.1, Q62/Q67). `values` is the
   *  Simulate Judgement sandbox's session inputs, saved verbatim — this
   *  action never touches simulateEvaluate.ts (see src/domain/simCase.ts). */
  addSimCase: (input: {
    label: string;
    prose: string;
    values: Record<string, ComparisonValue>;
    authorNotes?: string;
    expectedToFail?: boolean;
  }) => void;
  updateSimCase: (id: string, patch: Partial<Omit<SimCase, "id">>) => void;
  /** Deletions go to the RecycleBin, never a hard delete (CLAUDE.md). */
  removeSimCase: (id: string) => void;
  /** V2 review loop (docs/ROADMAP-V2.md §2.4, Q65): import an already-
   *  downloaded critique JSON — validated through critiqueSchema like every
   *  other I/O boundary. Never mutates anything beyond appending it; a
   *  disagreement is only ever promoted to a RecordEntry by an explicit,
   *  separate addRecordEntry call from the view. */
  importCritique: (raw: unknown) => { success: boolean; error?: string };
  /** Deletions go to the RecycleBin, never a hard delete (CLAUDE.md). */
  removeCritique: (id: string) => void;
  /** Restore a RecycleBin entry by index (Slice 10, R-149/Q18/⚠Q56). Returns
   *  what happened so the Deleted view can report success or the reason not. */
  restoreDeleted: (index: number) => RestoreResult;
  loadDocument: (doc: EvaluationQuestion, project: ProjectManifest | null) => void;
  loadProject: (project: ProjectManifest) => void;
  reset: () => void;
}

/** A filesystem-safe slug from a title (shared by the save/export file names). */
export function titleSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "evaluation-question"
  );
}

/** File name for an EQ inside its project folder, derived from the title (Q1).
 *  Retained for standalone-EQ import/export; the primary save unit is now the
 *  Project file below. */
export function evalqFileName(title: string): string {
  return `${titleSlug(title)}.evalq.json`;
}

/** File name for the single Project file that embeds all its EQs (revised Q1). */
export function projectFileName(name: string): string {
  return `${titleSlug(name)}.project.json`;
}

/** Export file name for an output artefact (Slice 8, R-118/R-124, Q21). */
export function outputFileName(title: string, ext: string): string {
  return `${titleSlug(title)}.${ext}`;
}

export const useStore = create<AppState>()((set, get) => {
  /** Upsert the active EQ back into its Project (single source of truth): the
   *  Project embeds every EQ, so each edit folds the active one in — Save then
   *  writes one file, and switching EQs never loses unsaved edits. */
  const upsertEqIntoProject = (
    project: ProjectManifest,
    doc: EvaluationQuestion,
  ): ProjectManifest => {
    const p = structuredClone(project);
    const i = p.evaluationQuestions.findIndex((q) => q.id === doc.id);
    if (i >= 0) p.evaluationQuestions[i] = doc;
    else p.evaluationQuestions.push(doc);
    p.updatedAt = doc.updatedAt;
    return p;
  };

  /** Clone the open document, mutate the clone, stamp updatedAt, fold it back
   *  into the Project, and set both. */
  const mutateDoc = (mutate: (doc: EvaluationQuestion) => void): void => {
    const current = get().doc;
    if (!current) return;
    const doc = structuredClone(current);
    mutate(doc);
    doc.updatedAt = new Date().toISOString();
    const project = get().project;
    set(project ? { doc, project: upsertEqIntoProject(project, doc) } : { doc });
  };

  /** The subordinate meso layer — where Slices 0–2 build (tierOrder 0, Q33). */
  const subordinateLayer = (doc: EvaluationQuestion): MesoLayer | undefined =>
    doc.mesoLayers.find((l) => l.tierOrder === 0);
  /** The optional superior meso layer (tierOrder 1) — Slice 7 (Q33). */
  const superiorLayer = (doc: EvaluationQuestion): MesoLayer | undefined =>
    findSuperiorLayer(doc);

  return {
    project: null,
    doc: null,
    view: "start",
    focusNodeId: null,
    evidenceReturnTo: null,

    createProject: (name) => {
      set({ project: createProjectManifest(name) });
    },

    // A new EQ is embedded in the current Project and becomes the active doc.
    createEQ: (title) => {
      const project = get().project;
      const doc = createEvaluationQuestion(title);
      if (project) {
        const updated = structuredClone(project);
        updated.evaluationQuestions.push(doc);
        updated.updatedAt = new Date().toISOString();
        set({ project: updated, doc, view: "question" });
      } else {
        set({ doc, view: "question" });
      }
    },

    // Open one of the Project's embedded EQs as the active doc (no file pick —
    // it's already in memory). Resumes at its first incomplete step.
    openEvaluationQuestion: (eqId) => {
      const eq = get().project?.evaluationQuestions.find((q) => q.id === eqId);
      if (!eq) return;
      const doc = structuredClone(eq);
      set({ doc, focusNodeId: null, view: firstIncompleteView(doc) });
    },

    setView: (view) => set({ view }),

    openNodeEditor: (nodeId) => set({ focusNodeId: nodeId, view: "criterion" }),

    setQuestionText: (text) => {
      mutateDoc((doc) => {
        doc.questionText = text;
        // Drop highlights whose offsets no longer match the edited text — the
        // denormalised `text` on each span is the stability anchor (R-034).
        if (doc.valueLanguage) {
          doc.valueLanguage = doc.valueLanguage.filter(
            (s) => text.slice(s.start, s.end) === s.text,
          );
        }
      });
    },

    // Highlight value-language in the question (R-034); overlapping/empty
    // selections are ignored so the highlights stay clean and disjoint.
    addValueSpan: (start, end, text) => {
      if (text.trim() === "" || end <= start) return;
      mutateDoc((doc) => {
        const spans = doc.valueLanguage ?? [];
        if (spans.some((s) => start < s.end && end > s.start)) return; // overlap
        spans.push(createValueSpan(start, end, text));
        spans.sort((a, b) => a.start - b.start);
        doc.valueLanguage = spans;
      });
    },

    removeValueSpan: (id) => {
      mutateDoc((doc) => {
        if (doc.valueLanguage) {
          doc.valueLanguage = doc.valueLanguage.filter((s) => s.id !== id);
        }
      });
    },

    // Value-language seeds the empty positive-side headers, bar-outward (Q34).
    seedContinuumFromValueLanguage: () => {
      mutateDoc((doc) => {
        const layer = doc.mesoLayers.find((l) => l.tierOrder === 0);
        if (!layer || !doc.valueLanguage) return;
        layer.continuum = seedHeadersFromValueLanguage(layer.continuum, doc.valueLanguage);
      });
    },

    setColumnLabel: (columnId, label) => {
      mutateDoc((doc) => {
        for (const layer of doc.mesoLayers) {
          const column = layer.continuum.columns.find((c) => c.id === columnId);
          if (column) column.label = label;
        }
      });
    },

    addColumn: (side) => {
      mutateDoc((doc) => {
        const layer = doc.mesoLayers.find((l) => l.tierOrder === 0);
        if (!layer) return;
        layer.continuum = addColumnTo(layer.continuum, side);
        syncCellsToColumns(layer); // keep every node's row one-cell-per-column (Invariant 5)
      });
    },

    removeColumn: (columnId) => {
      mutateDoc((doc) => {
        const layer = doc.mesoLayers.find((l) => l.tierOrder === 0);
        if (!layer) return;
        const result = removeColumnFrom(layer.continuum, columnId);
        if (!result.removed) return; // ≥1 each side is guaranteed by the helper
        layer.continuum = result.continuum;
        syncCellsToColumns(layer);
      });
    },

    // The kind renames every later label but changes nothing structural (R-048/Q15).
    setLayerKind: (kind) => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        if (layer) layer.kind = kind;
      });
    },

    // A new node starts with empty fields and a full open cell row (GWT-4.1).
    addNode: (name = "") => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        if (!layer) return;
        layer.nodes.push(createMesoNode(layer, name));
      });
    },

    updateNodeField: (nodeId, field, value) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (node) node[field] = value;
      });
    },

    // Deletion is never a hard delete — the node moves to the RecycleBin
    // (Invariant 20). It has no inbound links at this stage (Invariant 17).
    removeNode: (nodeId) => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        const node = layer?.nodes.find((n) => n.id === nodeId);
        if (!layer || !node) return;
        doc.recycleBin.deletedNodes.push({
          node,
          deletedAt: new Date().toISOString(),
          originPath: `mesoLayers/${layer.id}/nodes`,
        });
        layer.nodes = layer.nodes.filter((n) => n.id !== nodeId);
        renumber(layer.nodes);
      });
    },

    moveNode: (nodeId, direction) => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        if (!layer) return;
        const from = layer.nodes.findIndex((n) => n.id === nodeId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= layer.nodes.length) return;
        const [node] = layer.nodes.splice(from, 1);
        layer.nodes.splice(to, 0, node!);
        renumber(layer.nodes);
      });
    },

    // Importance is qualitative reach only — no numeric weight exists anywhere
    // (Q11/GWT-4.3). Marking a column pre-sets its cell's `included` default
    // (Q6); un-marking respects the ≥1-open-per-side guard (Q7/⚠Q36).
    setImportanceReach: (nodeId, columnId, reach) => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        const node = layer?.nodes.find((n) => n.id === nodeId);
        if (!layer || !node) return;
        if (!reach && !canExcludeCell(node, layer.continuum, columnId)) return;

        const marks = node.importance ?? [];
        const mark = marks.find((m) => m.columnId === columnId);
        if (mark) mark.reach = reach;
        else marks.push({ columnId, reach });
        node.importance = marks;

        const cell = node.cells.find((c) => c.columnId === columnId);
        if (cell) {
          cell.included = reach;
          if (!reach) {
            delete cell.plainDescription;
            cell.scenarios = [];
          }
        }
      });
    },

    // Marks the full-rubric review (J6) as done; the rubric stays editable
    // later (R-067) — this only satisfies the wizard's step order.
    confirmRubricReview: () => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        if (layer) layer.reviewConfirmed = true;
      });
    },

    setCellPlainDescription: (nodeId, cellId, text) => {
      mutateDoc((doc) => {
        const cell = findCell(doc, nodeId, cellId);
        if (cell?.included) cell.plainDescription = text;
      });
    },

    // V2 extension spec §3.2 (Invariant 22): prompted, never gated. Mirrors
    // setCellPlainDescription's included-only guard for consistency with
    // Invariant 6 (excluded cells carry no content).
    setCellDistinguishingCase: (nodeId, cellId, text) => {
      mutateDoc((doc) => {
        const cell = findCell(doc, nodeId, cellId);
        if (cell?.included) cell.distinguishingCase = text || undefined;
      });
    },

    // Excluding a cell withholds its content (Invariant 6) — cleared, not kept.
    // Closing the last open cell on either side of the bar is refused (Q7/⚠Q36).
    toggleCellIncluded: (nodeId, cellId) => {
      mutateDoc((doc) => {
        const layer = subordinateLayer(doc);
        const node = layer?.nodes.find((n) => n.id === nodeId);
        const cell = node?.cells.find((c) => c.id === cellId);
        if (!layer || !node || !cell) return;
        if (cell.included && !canExcludeCell(node, layer.continuum, cell.columnId)) return;
        cell.included = !cell.included;
        if (!cell.included) {
          delete cell.plainDescription;
          delete cell.distinguishingCase;
          cell.scenarios = [];
        }
      });
    },

    // A newly described method joins the per-EQ shared pool and links to the
    // node with its criterion-fit justification (R-070–R-072, R-079).
    addEvidenceMethod: (nodeId, { name, whatWillBeDone, fitJustification }) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const method = createEvidenceMethod(name, whatWillBeDone);
        doc.evidenceMethods.push(method);
        node.evidenceLinks.push(createEvidenceLink(method.id, node.id, fitJustification));
      });
    },

    // Reuse carries every method field by shared reference; only the fit
    // justification starts anew, empty (R-080, GWT-7.1, Invariant 10).
    reuseEvidenceMethod: (nodeId, methodId) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (!node || !method) return;
        if (node.evidenceLinks.some((l) => l.evidenceMethodId === methodId)) return;
        node.evidenceLinks.push(createEvidenceLink(methodId, nodeId, ""));
      });
    },

    updateEvidenceMethod: (methodId, field, value) => {
      mutateDoc((doc) => {
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (method) method[field] = value;
      });
    },

    updateFitJustification: (nodeId, linkId, text) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        const link = node?.evidenceLinks.find((l) => l.id === linkId);
        if (link) link.fitJustification = text;
      });
    },

    // Unlinking a method from a node is a deletion → RecycleBin (Invariant 20).
    // The method itself stays in the shared pool for other criteria (R-079).
    removeEvidenceLink: (nodeId, linkId) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        const link = node?.evidenceLinks.find((l) => l.id === linkId);
        if (!node || !link) return;
        doc.recycleBin.deletedNodes.push({
          node: link,
          deletedAt: new Date().toISOString(),
          originPath: `nodes/${nodeId}/evidenceLinks`,
        });
        node.evidenceLinks = node.evidenceLinks.filter((l) => l.id !== linkId);
        recycleTierContentForMethod(doc, node, link.evidenceMethodId);
      });
    },

    // Dedupe: two separately-described methods declared the *same* method
    // (R-081) — a symmetric link, so the Evidence Matrix can merge them
    // (R-082). Distinct from mixed-methods aggregation (Q25).
    linkMethodsAsSame: (methodIdA, methodIdB) => {
      if (methodIdA === methodIdB) return;
      mutateDoc((doc) => {
        const a = doc.evidenceMethods.find((m) => m.id === methodIdA);
        const b = doc.evidenceMethods.find((m) => m.id === methodIdB);
        if (!a || !b) return;
        a.dedupeLinkedIds = [...new Set([...(a.dedupeLinkedIds ?? []), b.id])];
        b.dedupeLinkedIds = [...new Set([...(b.dedupeLinkedIds ?? []), a.id])];
      });
    },

    unlinkMethods: (methodIdA, methodIdB) => {
      mutateDoc((doc) => {
        const a = doc.evidenceMethods.find((m) => m.id === methodIdA);
        const b = doc.evidenceMethods.find((m) => m.id === methodIdB);
        if (a) a.dedupeLinkedIds = a.dedupeLinkedIds?.filter((id) => id !== methodIdB);
        if (b) b.dedupeLinkedIds = b.dedupeLinkedIds?.filter((id) => id !== methodIdA);
      });
    },

    // The mandatory rubric-xor-list fork (R-074, Q13/Q32). Re-choosing the
    // same shape keeps existing work; switching shapes moves the old tier to
    // the RecycleBin rather than hard-deleting it (Invariant 20).
    chooseEvidenceTier: (nodeId, shape) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (node.evidenceTier?.shape === shape) return;
        if (node.evidenceTier) {
          doc.recycleBin.deletedNodes.push({
            node: node.evidenceTier,
            deletedAt: new Date().toISOString(),
            originPath: `nodes/${nodeId}/evidenceTier`,
          });
        }
        node.evidenceTier =
          shape === "list"
            ? createDataDescriptionList(nodeId)
            : createEvidenceTierRubric(nodeId);
      });
    },

    // The list shows one auto row per linked Evidence/Method (2026-07-14 notes,
    // Q37): upsert that method's entry; an emptied description drops the entry
    // so only real content is stored (matching methodLevelCells).
    setDataDescription: (nodeId, methodId, text) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        const tier = node?.evidenceTier;
        if (!node || tier?.shape !== "list") return;
        if (!node.evidenceLinks.some((l) => l.evidenceMethodId === methodId)) return;
        const entry = tier.entries.find((e) => e.evidenceMethodId === methodId);
        if (entry) {
          if (text === "") tier.entries = tier.entries.filter((e) => e !== entry);
          else entry.description = text;
        } else if (text !== "") {
          tier.entries.push({ evidenceMethodId: methodId, description: text });
        }
      });
    },

    updateDataEntry: (nodeId, index, patch) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        const entry = tier?.shape === "list" ? tier.entries[index] : undefined;
        if (!entry) return;
        if (patch.description !== undefined) entry.description = patch.description;
        if (patch.evidenceMethodId !== undefined) {
          if (patch.evidenceMethodId === "") delete entry.evidenceMethodId;
          else entry.evidenceMethodId = patch.evidenceMethodId;
        }
      });
    },

    removeDataEntry: (nodeId, index) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        if (tier?.shape !== "list") return;
        tier.entries.splice(index, 1);
      });
    },

    setEvidenceColumnLabel: (nodeId, columnId, label) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        if (tier?.shape !== "rubric") return;
        const column = tier.continuum.columns.find((c) => c.id === columnId);
        if (column) column.label = label;
      });
    },

    addEvidenceColumn: (nodeId, side) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        if (tier?.shape !== "rubric") return;
        tier.continuum = addColumnTo(tier.continuum, side);
      });
    },

    removeEvidenceColumn: (nodeId, columnId) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        if (tier?.shape !== "rubric") return;
        const result = removeColumnFrom(tier.continuum, columnId);
        if (!result.removed) return;
        tier.continuum = result.continuum;
        tier.methodLevelCells = tier.methodLevelCells.filter((c) =>
          tier.continuum.columns.some((col) => col.id === c.columnId),
        );
      });
    },

    // Upsert the per-method level description (R-075); an emptied description
    // drops its cell so the rubric stores only real content.
    setMethodLevelDescription: (nodeId, methodId, columnId, text) => {
      mutateDoc((doc) => {
        const tier = evidenceTierOf(doc, nodeId);
        if (tier?.shape !== "rubric") return;
        const cell = tier.methodLevelCells.find(
          (c) => c.evidenceMethodId === methodId && c.columnId === columnId,
        );
        if (cell) {
          if (text === "") {
            tier.methodLevelCells = tier.methodLevelCells.filter((c) => c !== cell);
          } else {
            cell.description = text;
          }
        } else if (text !== "") {
          tier.methodLevelCells.push({
            evidenceMethodId: methodId,
            columnId,
            description: text,
          });
        }
      });
    },

    // Combine ≥2 of the node's methods into a mixed-methods source (R-169–
    // R-173): a new Evidence/Method at the tier, linked to this node with an
    // empty fit justification (⚠Q39), its members copied below as SubMethods.
    // A mixed source cannot itself be a member in v1 (⚠Q38).
    combineMethods: (nodeId, memberMethodIds, input) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const members = [...new Set(memberMethodIds)];
        const linkable = members.every((id) => {
          const method = doc.evidenceMethods.find((m) => m.id === id);
          return (
            method !== undefined &&
            !method.isMixedMethodsSource &&
            node.evidenceLinks.some((l) => l.evidenceMethodId === id)
          );
        });
        if (members.length < 2 || !linkable) return; // Invariant 12
        const source = createMixedMethodsSource(input.name, members);
        source.mixedMethodsType = input.type;
        if (input.type === "other" && input.customName !== undefined) {
          source.mixedMethodsCustomName = input.customName;
        }
        source.mixedMethodsExplanation = input.explanation;
        doc.evidenceMethods.push(source);
        node.evidenceLinks.push(createEvidenceLink(source.id, nodeId, ""));
      });
    },

    // The type is stored once per source (Q28); anything but "other" drops
    // the custom strategy name (R-166/R-167).
    setMixedMethodsType: (methodId, type) => {
      mutateDoc((doc) => {
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (!method || !method.isMixedMethodsSource) return;
        method.mixedMethodsType = type;
        if (type !== "other") delete method.mixedMethodsCustomName;
      });
    },

    setMixedMethodsCustomName: (methodId, name) => {
      mutateDoc((doc) => {
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (method?.mixedMethodsType === "other") {
          method.mixedMethodsCustomName = name;
        }
      });
    },

    setMixedMethodsExplanation: (methodId, text) => {
      mutateDoc((doc) => {
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (method?.isMixedMethodsSource) method.mixedMethodsExplanation = text;
      });
    },

    // "Some existing sources are mixed-methods" (R-165): a property of the
    // method itself, so it holds pool-wide. Combined sources are inherently
    // mixed and cannot be un-ticked. Un-ticking clears the type fields.
    tickMethodAsMixed: (methodId, ticked) => {
      mutateDoc((doc) => {
        const method = doc.evidenceMethods.find((m) => m.id === methodId);
        if (!method || method.memberSubMethods !== undefined) return;
        method.isMixedMethodsSource = ticked;
        if (!ticked) {
          delete method.mixedMethodsType;
          delete method.mixedMethodsCustomName;
          delete method.mixedMethodsExplanation;
        }
      });
    },

    // R-174/R-175 (Q27/⚠Q38): "only for this purpose" removes the member's
    // link (and its tier content) from this node — the method object stays in
    // the pool as the SubMethod's data carrier. Re-retaining re-links it with
    // a fresh, empty fit justification.
    setSubMethodRetention: (nodeId, subMethodId, retained) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const sub = doc.evidenceMethods
          .flatMap((m) => m.memberSubMethods ?? [])
          .find((s) => s.id === subMethodId);
        if (!sub || sub.retainedAtEvidenceTier === retained) return;
        sub.retainedAtEvidenceTier = retained;
        const link = node.evidenceLinks.find(
          (l) => l.evidenceMethodId === sub.sourceMethodId,
        );
        if (!retained && link) {
          doc.recycleBin.deletedNodes.push({
            node: link,
            deletedAt: new Date().toISOString(),
            originPath: `nodes/${nodeId}/evidenceLinks`,
          });
          node.evidenceLinks = node.evidenceLinks.filter((l) => l !== link);
          recycleTierContentForMethod(doc, node, sub.sourceMethodId);
        } else if (retained && !link) {
          node.evidenceLinks.push(createEvidenceLink(sub.sourceMethodId, nodeId, ""));
        }
      });
    },

    // Completing or declining the J9 step for this node (R-162–R-164); the
    // some-existing path also writes the sub-methods-space note (R-168).
    resolveMixedMethods: (nodeId, note) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.mixedMethodsResolved = true;
        if (note !== undefined && note.trim() !== "") node.subMethodsNote = note;
      });
    },

    // ---- J10: connect evidence to conclusions (R-083–R-097) ------------------

    // A new empty Scenario box in the cell's Evidence row (R-087). Only open
    // cells carry scenarios (Invariant 6).
    addScenario: (nodeId, cellId) => {
      mutateDoc((doc) => {
        const cell = cellOf(doc, nodeId, cellId);
        if (!cell || !cell.included) return;
        cell.scenarios.push(createScenario(cell.scenarios.length));
      });
    },

    // The prose editor writes the whole token-bearing prose back (Q41). Token
    // parts must name an Evidence/Method that exists in the EQ pool — the UI
    // only offers the node's linked methods, and a later unlink must not eat
    // the mention from the prose (⚠Q43). Collective parts are a synthesis-only
    // concept (R-110) and are refused here.
    updateScenarioParts: (nodeId, cellId, scenarioId, parts) => {
      mutateDoc((doc) => {
        const scenario = cellOf(doc, nodeId, cellId)?.scenarios.find(
          (s) => s.id === scenarioId,
        );
        if (!scenario) return;
        scenario.parts = parts.filter(
          (p) =>
            p.kind === "text" ||
            (p.kind === "token" &&
              doc.evidenceMethods.some((m) => m.id === p.targetId)),
        );
      });
    },

    removeScenario: (nodeId, cellId, scenarioId) => {
      mutateDoc((doc) => {
        const cell = cellOf(doc, nodeId, cellId);
        const scenario = cell?.scenarios.find((s) => s.id === scenarioId);
        if (!cell || !scenario) return;
        doc.recycleBin.deletedNodes.push({
          node: scenario,
          deletedAt: new Date().toISOString(),
          originPath: `nodes/${nodeId}/cells/${cellId}/scenarios`,
        });
        cell.scenarios = cell.scenarios.filter((s) => s.id !== scenarioId);
        cell.scenarios.forEach((s, i) => {
          s.order = i;
        });
      });
    },

    // Clarity Rating 1–5, numeric with only the endpoints labelled (Q8). A
    // re-rating of 4–5 drops any stale "may not be clear" decline note — that
    // note only pairs with a 1–3 rating (R-093/R-096, Invariant 14).
    setCellClarity: (nodeId, cellId, rating) => {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
      mutateDoc((doc) => {
        const cell = cellOf(doc, nodeId, cellId);
        if (!cell || !cell.included) return;
        cell.clarityRating = rating;
        if (rating >= 4) delete cell.clarityNote;
      });
    },

    setCellClarityNote: (nodeId, cellId, text) => {
      mutateDoc((doc) => {
        const cell = cellOf(doc, nodeId, cellId);
        if (!cell) return;
        if (text.trim() === "") delete cell.clarityNote;
        else cell.clarityNote = text;
      });
    },

    // Save a cell's condition (Slice 13). The cell may be on either meso layer
    // (a subordinate criterion, or a superior component), so search all layers.
    // Saving always succeeds even when the boolean logic carries validation
    // errors — errors are informational, not blocking (R-COND-9).
    setCellCondition: (nodeId, cellId, condition) => {
      mutateDoc((doc) => {
        const cell = findCell(doc, nodeId, cellId);
        if (!cell) return;
        cell.condition = { ...condition, lastModified: new Date().toISOString() };
      });
    },

    // R-094/R-095: the add-evidence prompt's "yes" jumps to evidence planning
    // for just this node, and the evidence step hands back to J10 when done.
    beginEvidenceReentry: (nodeId) => {
      set({ focusNodeId: nodeId, view: "evidence", evidenceReturnTo: "connect" });
    },

    // ---- Slice 7: second meso layer (R-045–R-047, Q3/Q4/Q33) -----------------

    // Grow a second (superior) meso layer above the subordinate one (R-045).
    // The new layer is superior (tierOrder 1) so the existing layer keeps its
    // evidence tier (Q33); it is what synthesis then feeds from (Q4). Refused
    // once a second layer exists — two-layer cap (Invariant 18, Q3).
    addSecondMesoLayer: (kind) => {
      mutateDoc((doc) => {
        if (doc.mesoLayers.length >= 2) return; // Invariant 18 — no third layer
        doc.mesoLayers.push(createSecondMesoLayer(kind));
      });
    },

    // Removing the second layer is how the optional stage is *declined* (Q20):
    // the superior layer moves to the RecycleBin (Invariant 20) and every
    // subordinate node's rollup parent is cleared so no link dangles.
    removeSecondMesoLayer: () => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        if (!superior) return;
        doc.recycleBin.deletedNodes.push({
          node: superior,
          deletedAt: new Date().toISOString(),
          originPath: "mesoLayers",
        });
        doc.mesoLayers = doc.mesoLayers.filter((l) => l.id !== superior.id);
        const subordinate = subordinateLayer(doc);
        for (const node of subordinate?.nodes ?? []) delete node.parentNodeId;
      });
    },

    // A superior-layer node (the parent a set of subordinate nodes roll up
    // into). It carries a rubric row like any MesoNode but never evidence (Q33).
    addSuperiorNode: (name = "") => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        if (superior) superior.nodes.push(createMesoNode(superior, name));
      });
    },

    renameSuperiorNode: (nodeId, name) => {
      mutateDoc((doc) => {
        const node = superiorLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (node) node.name = name;
      });
    },

    // Deletion → RecycleBin (Invariant 20); any subordinate node that rolled up
    // into it loses its parent so the rollup never dangles (Invariant 18).
    removeSuperiorNode: (nodeId) => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        const node = superior?.nodes.find((n) => n.id === nodeId);
        if (!superior || !node) return;
        doc.recycleBin.deletedNodes.push({
          node,
          deletedAt: new Date().toISOString(),
          originPath: `mesoLayers/${superior.id}/nodes`,
        });
        superior.nodes = superior.nodes.filter((n) => n.id !== nodeId);
        renumber(superior.nodes);
        for (const child of subordinateLayer(doc)?.nodes ?? []) {
          if (child.parentNodeId === nodeId) delete child.parentNodeId;
        }
      });
    },

    addSuperiorColumn: (side) => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        if (!superior) return;
        superior.continuum = addColumnTo(superior.continuum, side);
        syncCellsToColumns(superior);
      });
    },

    removeSuperiorColumn: (columnId) => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        if (!superior) return;
        const result = removeColumnFrom(superior.continuum, columnId);
        if (!result.removed) return;
        superior.continuum = result.continuum;
        syncCellsToColumns(superior);
      });
    },

    // Roll a subordinate node up into a superior node (R-046). `null` clears it.
    // The parent must be an existing superior node (Invariant 18).
    setNodeParent: (nodeId, parentNodeId) => {
      mutateDoc((doc) => {
        const node = subordinateLayer(doc)?.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (parentNodeId === null) {
          delete node.parentNodeId;
          return;
        }
        if (superiorLayer(doc)?.nodes.some((n) => n.id === parentNodeId)) {
          node.parentNodeId = parentNodeId;
        }
      });
    },

    // ---- Inter-layer connect pass (Q53/Q54) ----------------------------------
    // Subordinate nodes feed the superior layer the same way evidence feeds
    // criteria (J10), but "up" a layer: each superior node's open cells collect
    // conditional-statement Scenarios whose tokens name **subordinate** nodes
    // (the clicked subordinate rubric column as `atColumnId`). Reuses the
    // Scenario shape verbatim — superior cells already carry `scenarios[]`, so
    // no schema change. Encouraged, never gated (Q54 (b)).

    addSuperiorScenario: (nodeId, cellId) => {
      mutateDoc((doc) => {
        const cell = superiorLayer(doc)
          ?.nodes.find((n) => n.id === nodeId)
          ?.cells.find((c) => c.id === cellId);
        if (!cell || !cell.included) return;
        cell.scenarios.push(createScenario(cell.scenarios.length));
      });
    },

    // Token parts must name a node in the **subordinate** layer (the layer being
    // rolled up) — the click panel only offers those, and an unrelated part is
    // refused. Collective parts are a synthesis-only concept (R-110) and are not
    // offered here, so they are dropped, mirroring J10's updateScenarioParts.
    updateSuperiorScenarioParts: (nodeId, cellId, scenarioId, parts) => {
      mutateDoc((doc) => {
        const scenario = superiorLayer(doc)
          ?.nodes.find((n) => n.id === nodeId)
          ?.cells.find((c) => c.id === cellId)
          ?.scenarios.find((s) => s.id === scenarioId);
        if (!scenario) return;
        const subordinateIds = new Set(
          subordinateLayer(doc)?.nodes.map((n) => n.id) ?? [],
        );
        scenario.parts = parts.filter(
          (p) => p.kind === "text" || (p.kind === "token" && subordinateIds.has(p.targetId)),
        );
      });
    },

    removeSuperiorScenario: (nodeId, cellId, scenarioId) => {
      mutateDoc((doc) => {
        const superior = superiorLayer(doc);
        const cell = superior
          ?.nodes.find((n) => n.id === nodeId)
          ?.cells.find((c) => c.id === cellId);
        const scenario = cell?.scenarios.find((s) => s.id === scenarioId);
        if (!superior || !cell || !scenario) return;
        doc.recycleBin.deletedNodes.push({
          node: scenario,
          deletedAt: new Date().toISOString(),
          originPath: `mesoLayers/${superior.id}/nodes/${nodeId}/cells/${cellId}/scenarios`,
        });
        cell.scenarios = cell.scenarios.filter((s) => s.id !== scenarioId);
        cell.scenarios.forEach((s, i) => {
          s.order = i;
        });
      });
    },

    // ---- J11: Overall Judgement / synthesis (R-098–R-112) --------------------

    // Accepting the synthesis choice creates the rubric (2+2 continuum seeded
    // from the value language — R-100/R-101) and clears an earlier decline.
    // Re-accepting with a rubric already present keeps the existing work.
    acceptSynthesis: () => {
      mutateDoc((doc) => {
        delete doc.synthesisDeclined;
        if (!doc.overallJudgement) {
          doc.overallJudgement = createOverallJudgement(doc.valueLanguage ?? []);
        }
      });
    },

    // Declining records the done-or-declined choice (Q5/Q20); a built rubric
    // moves to the RecycleBin rather than being hard-deleted (Invariant 20).
    declineSynthesis: () => {
      mutateDoc((doc) => {
        doc.synthesisDeclined = true;
        if (doc.overallJudgement) {
          doc.recycleBin.deletedNodes.push({
            node: doc.overallJudgement,
            deletedAt: new Date().toISOString(),
            originPath: "overallJudgement",
          });
          delete doc.overallJudgement;
        }
      });
    },

    setJudgementColumnLabel: (columnId, label) => {
      mutateDoc((doc) => {
        const column = doc.overallJudgement?.continuum.columns.find(
          (c) => c.id === columnId,
        );
        if (column) column.label = label;
      });
    },

    addJudgementColumn: (side) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (judgement) judgement.continuum = addColumnTo(judgement.continuum, side);
      });
    },

    // Removing a synthesis column drops its cells and recycles the scenarios
    // it would orphan (Invariant 17/20); ≥1 per side holds via the helper.
    removeJudgementColumn: (columnId) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement) return;
        const result = removeColumnFrom(judgement.continuum, columnId);
        if (!result.removed) return;
        judgement.continuum = result.continuum;
        judgement.decisionCells = judgement.decisionCells.filter(
          (c) => c.columnId !== columnId,
        );
        judgement.plainDescriptionCells = judgement.plainDescriptionCells.filter(
          (c) => c.columnId !== columnId,
        );
        if (judgement.conditionCells) {
          judgement.conditionCells = judgement.conditionCells.filter(
            (c) => c.columnId !== columnId,
          );
          if (judgement.conditionCells.length === 0) delete judgement.conditionCells;
        }
        for (const scenario of judgement.scenarios) {
          if (scenario.yieldsColumnId === columnId) {
            doc.recycleBin.deletedNodes.push({
              node: scenario,
              deletedAt: new Date().toISOString(),
              originPath: "overallJudgement/scenarios",
            });
          }
        }
        judgement.scenarios = judgement.scenarios.filter(
          (s) => s.yieldsColumnId !== columnId,
        );
      });
    },

    // R-102: the Decision row can be removed or added. Toggling off hides the
    // row but keeps its text — a toggle is not a delete (⚠Q46 provisional).
    toggleDecisionRow: () => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (judgement) judgement.decisionRowEnabled = !judgement.decisionRowEnabled;
      });
    },

    setDecisionCellText: (columnId, text) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement || !judgement.decisionRowEnabled) return;
        upsertCell(judgement.decisionCells, judgement.continuum, columnId, text);
      });
    },

    setJudgementPlainDescription: (columnId, text) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement) return;
        upsertCell(judgement.plainDescriptionCells, judgement.continuum, columnId, text);
      });
    },

    // A new criterion-conditions Scenario in a judgement column's cell —
    // OR-separated alternatives, same as J10 (R-107).
    addJudgementScenario: (columnId) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement) return;
        if (!judgement.continuum.columns.some((c) => c.id === columnId)) return;
        const inColumn = judgement.scenarios.filter(
          (s) => s.yieldsColumnId === columnId,
        );
        judgement.scenarios.push(createJudgementScenario(inColumn.length, columnId));
      });
    },

    removeJudgementScenario: (scenarioId) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        const scenario = judgement?.scenarios.find((s) => s.id === scenarioId);
        if (!judgement || !scenario) return;
        doc.recycleBin.deletedNodes.push({
          node: scenario,
          deletedAt: new Date().toISOString(),
          originPath: "overallJudgement/scenarios",
        });
        judgement.scenarios = judgement.scenarios.filter((s) => s.id !== scenarioId);
        judgement.scenarios
          .filter((s) => s.yieldsColumnId === scenario.yieldsColumnId)
          .forEach((s, i) => {
            s.order = i;
          });
      });
    },

    // Token parts must name a meso node (criterion/component — R-108); the
    // R-110 collective parts carry their own label. Same whole-prose write-back
    // as J10's updateScenarioParts (Q41/⚠Q44).
    updateJudgementScenarioParts: (scenarioId, parts) => {
      mutateDoc((doc) => {
        const scenario = doc.overallJudgement?.scenarios.find(
          (s) => s.id === scenarioId,
        );
        if (!scenario) return;
        const nodeIds = new Set(
          doc.mesoLayers.flatMap((l) => l.nodes.map((n) => n.id)),
        );
        scenario.parts = parts.filter(
          (p) => p.kind !== "token" || nodeIds.has(p.targetId),
        );
      });
    },

    // Save/clear a judgement column's condition (Slice 14, Q61). The condition
    // builder here mirrors the criterion layer's; it stores per-column into
    // `conditionCells` and stamps `lastModified`. Never executed in the real
    // flow — only the ephemeral simulate sandbox reads it.
    setJudgementCondition: (columnId, condition) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement) return;
        if (!judgement.continuum.columns.some((c) => c.id === columnId)) return;
        const cells = judgement.conditionCells ?? [];
        const at = cells.findIndex((c) => c.columnId === columnId);
        if (condition === null) {
          if (at >= 0) cells.splice(at, 1);
        } else {
          const stamped = { ...condition, lastModified: new Date().toISOString() };
          if (at >= 0) cells[at]!.condition = stamped;
          else cells.push({ columnId, condition: stamped });
        }
        judgement.conditionCells = cells.length > 0 ? cells : undefined;
      });
    },

    // R-112: the whole-synthesis free-text escape hatch. Non-empty text
    // satisfies the step by itself (⚠Q45).
    setSynthesisFreeText: (text) => {
      mutateDoc((doc) => {
        const judgement = doc.overallJudgement;
        if (!judgement) return;
        if (text.trim() === "") delete judgement.freeTextOverride;
        else judgement.freeTextOverride = text;
      });
    },

    // The single per-EQ Notes area (Slice 10, R-030, Q19) — an ongoing audit
    // trail, openable/hidable from every view. Emptying it drops the field so
    // the saved document stays clean.
    setNotes: (text) => {
      mutateDoc((doc) => {
        if (text === "") delete doc.notes;
        else doc.notes = text;
      });
    },

    // V2 record layer (docs/ROADMAP-V2.md §1.3, Q64) — reasoned-change
    // history. `reason` is enforced non-empty at the schema boundary
    // (recordEntrySchema), not just here; this action never runs
    // automatically from another mutation (that would be exactly the
    // auto-logging the extension spec forbids).
    addRecordEntry: (entry) => {
      mutateDoc((doc) => {
        doc.records.push({
          id: crypto.randomUUID(),
          elementRef: entry.elementRef,
          timestamp: new Date().toISOString(),
          author: entry.author,
          changeSummary: entry.changeSummary,
          reason: entry.reason,
          prompt: entry.prompt,
          includeInExport: entry.includeInExport ?? true,
          ...(entry.previousValue !== undefined ? { previousValue: entry.previousValue } : {}),
          ...(entry.newValue !== undefined ? { newValue: entry.newValue } : {}),
        });
      });
    },

    updateRecordEntry: (id, patch) => {
      mutateDoc((doc) => {
        const entry = doc.records.find((r) => r.id === id);
        if (entry) Object.assign(entry, patch);
      });
    },

    setRecordIncludeInExport: (id, include) => {
      mutateDoc((doc) => {
        const entry = doc.records.find((r) => r.id === id);
        if (entry) entry.includeInExport = include;
      });
    },

    // Never a hard delete (CLAUDE.md) — the entry moves to the RecycleBin like
    // everything else, restorable via the "records" originPath case.
    removeRecordEntry: (id) => {
      mutateDoc((doc) => {
        const index = doc.records.findIndex((r) => r.id === id);
        if (index < 0) return;
        const [entry] = doc.records.splice(index, 1);
        doc.recycleBin.deletedNodes.push({
          node: entry,
          deletedAt: new Date().toISOString(),
          originPath: "records",
        });
      });
    },

    // V2 review loop (docs/ROADMAP-V2.md §2.1, Q62/Q67) — persists an
    // authored hypothetical. Never touches simulateEvaluate.ts; `values` is
    // opaque data to the store, shaped by the caller (SimulateJudgementView).
    addSimCase: ({ label, prose, values, authorNotes, expectedToFail }) => {
      mutateDoc((doc) => {
        const next = createSimCase(label, prose, values);
        if (authorNotes !== undefined) next.authorNotes = authorNotes;
        if (expectedToFail !== undefined) next.expectedToFail = expectedToFail;
        doc.simCases.push(next);
      });
    },

    updateSimCase: (id, patch) => {
      mutateDoc((doc) => {
        const c = doc.simCases.find((sc) => sc.id === id);
        if (c) Object.assign(c, patch);
      });
    },

    // Never a hard delete (CLAUDE.md) — restorable via the "simCases" originPath case.
    removeSimCase: (id) => {
      mutateDoc((doc) => {
        const index = doc.simCases.findIndex((c) => c.id === id);
        if (index < 0) return;
        const [entry] = doc.simCases.splice(index, 1);
        doc.recycleBin.deletedNodes.push({
          node: entry,
          deletedAt: new Date().toISOString(),
          originPath: "simCases",
        });
      });
    },

    // V2 review loop (docs/ROADMAP-V2.md §2.4, Q65) — validated through
    // critiqueSchema like every other I/O boundary (R-011/R-012 discipline).
    // Never mutates the framework beyond appending the critique itself.
    importCritique: (raw) => {
      const parsed = critiqueSchema.safeParse(raw);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid critique file." };
      }
      mutateDoc((doc) => {
        doc.critiques.push(parsed.data);
      });
      return { success: true };
    },

    // Never a hard delete (CLAUDE.md) — restorable via the "critiques" originPath case.
    removeCritique: (id) => {
      mutateDoc((doc) => {
        const index = doc.critiques.findIndex((c) => c.id === id);
        if (index < 0) return;
        const [entry] = doc.critiques.splice(index, 1);
        doc.recycleBin.deletedNodes.push({
          node: entry,
          deletedAt: new Date().toISOString(),
          originPath: "critiques",
        });
      });
    },

    // Restore from the RecycleBin (Slice 10, R-149/Q18/⚠Q56). The pure
    // `restoreDeletedItem` does the work on a clone; we only commit when it
    // actually restored something, and hand the result back for the UI message.
    restoreDeleted: (index) => {
      const current = get().doc;
      if (!current) return { restored: false, reason: "No document is open." };
      const doc = structuredClone(current);
      const result = restoreDeletedItem(doc, index);
      if (result.restored) {
        doc.updatedAt = new Date().toISOString();
        set({ doc });
      }
      return result;
    },

    // Open (or restore) an EQ. It must live in a Project (the single-file model):
    // fold it into the given Project, or, when opening a standalone `.evalq.json`
    // with no Project loaded, wrap it in a fresh one named after the EQ.
    loadDocument: (doc, project) => {
      if (project) {
        set({ project: upsertEqIntoProject(project, doc), doc, view: "home", focusNodeId: null });
      } else {
        const wrap = createProjectManifest(doc.title || "Project");
        wrap.evaluationQuestions = [doc];
        set({ project: wrap, doc, view: "home", focusNodeId: null });
      }
    },

    // Opening a Project file loads all its embedded EQs. The document isn't
    // chosen yet — the Start view lists the EQs so the user picks one (or a
    // single-EQ Project could be opened straight away by the caller).
    loadProject: (project) => {
      set({ project, doc: null });
    },

    reset: () =>
      set({
        project: null,
        doc: null,
        view: "start",
        focusNodeId: null,
        evidenceReturnTo: null,
      }),
  };
});

/** Keep `order` contiguous (0..N-1) after node removal or reordering (R-157). */
function renumber(nodes: MesoNode[]): void {
  nodes.forEach((node, i) => {
    node.order = i;
  });
}

/**
 * Keep every node's rubric row exactly one cell per column after the column set
 * changes (Invariant 5), and its importance marks in step. New columns get an
 * open, empty cell and a reach mark (matching createMesoNode); cells/marks for
 * removed columns are dropped.
 */
function syncCellsToColumns(layer: MesoLayer): void {
  const columnIds = new Set(layer.continuum.columns.map((c) => c.id));
  for (const node of layer.nodes) {
    node.cells = node.cells.filter((cell) => columnIds.has(cell.columnId));
    if (node.importance) {
      node.importance = node.importance.filter((m) => columnIds.has(m.columnId));
    }
    const covered = new Set(node.cells.map((c) => c.columnId));
    for (const column of layer.continuum.columns) {
      if (!covered.has(column.id)) {
        node.cells.push({
          id: crypto.randomUUID(),
          columnId: column.id,
          included: true,
          scenarios: [],
        });
        node.importance?.push({ columnId: column.id, reach: true });
      }
    }
  }
}

/**
 * When a method leaves a node's evidence tier (link removed, or a sub-method
 * marked not-retained — ⚠Q38), its tier content on that node is stale: list
 * entries would render against a method no longer linked, and rubric level
 * cells would linger invisibly. Move them to the RecycleBin (Invariant 20).
 */
function recycleTierContentForMethod(
  doc: EvaluationQuestion,
  node: MesoNode,
  methodId: string,
): void {
  const tier = node.evidenceTier;
  if (!tier) return;
  const recycle = (content: unknown, kind: string) => {
    doc.recycleBin.deletedNodes.push({
      node: content,
      deletedAt: new Date().toISOString(),
      originPath: `nodes/${node.id}/evidenceTier/${kind}`,
    });
  };
  if (tier.shape === "list") {
    for (const entry of tier.entries) {
      if (entry.evidenceMethodId === methodId) recycle(entry, "entries");
    }
    tier.entries = tier.entries.filter((e) => e.evidenceMethodId !== methodId);
  } else {
    for (const cell of tier.methodLevelCells) {
      if (cell.evidenceMethodId === methodId) recycle(cell, "methodLevelCells");
    }
    tier.methodLevelCells = tier.methodLevelCells.filter(
      (c) => c.evidenceMethodId !== methodId,
    );
  }
}

/** The evidence tier of a subordinate-layer node, if any. */
function evidenceTierOf(doc: EvaluationQuestion, nodeId: string) {
  return doc.mesoLayers
    .find((l) => l.tierOrder === 0)
    ?.nodes.find((n) => n.id === nodeId)?.evidenceTier;
}

/**
 * Upsert a per-column synthesis cell (Decision / plain description): only real
 * content is stored — an emptied cell drops out (matching methodLevelCells).
 */
function upsertCell(
  cells: { columnId: string; text: string }[],
  continuum: Continuum,
  columnId: string,
  text: string,
): void {
  if (!continuum.columns.some((c) => c.id === columnId)) return;
  const at = cells.findIndex((c) => c.columnId === columnId);
  if (text === "") {
    if (at >= 0) cells.splice(at, 1);
  } else if (at >= 0) {
    cells[at]!.text = text;
  } else {
    cells.push({ columnId, text });
  }
}

/** A cell of a subordinate-layer node, if any. */
function cellOf(doc: EvaluationQuestion, nodeId: string, cellId: string) {
  return doc.mesoLayers
    .find((l) => l.tierOrder === 0)
    ?.nodes.find((n) => n.id === nodeId)
    ?.cells.find((c) => c.id === cellId);
}

function findCell(doc: EvaluationQuestion, nodeId: string, cellId: string) {
  for (const layer of doc.mesoLayers) {
    const node = layer.nodes.find((n) => n.id === nodeId);
    const cell = node?.cells.find((c) => c.id === cellId);
    if (cell) return cell;
  }
  return undefined;
}
