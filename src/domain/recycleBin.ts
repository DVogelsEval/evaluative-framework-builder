import type {
  Cell,
  Continuum,
  Critique,
  DataDescriptionList,
  EvaluationQuestion,
  EvidenceLink,
  EvidenceTier,
  EvidenceTierRubric,
  JudgementScenario,
  MesoLayer,
  MesoNode,
  OverallJudgement,
  RecordEntry,
  Scenario,
  SimCase,
} from "./schema";

/**
 * Read-only summaries of the RecycleBin (Slice 10, R-149/Q18). Deletions across
 * the app push `{ node, deletedAt, originPath }` (Invariant 20 — never a hard
 * delete); this classifies each entry by its `originPath` and stored shape so the
 * Deleted view can list "what was deleted, and when" without touching the
 * document. The stored `node` is `unknown` (heterogeneous), so every read is
 * defensive. `restoreDeletedItem` (below) puts an entry back.
 */

export interface DeletedItem {
  /** Index into `recycleBin.deletedNodes` — the future restore handle. */
  index: number;
  kind: string;
  label: string;
  deletedAt: string;
  originPath: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function deletedItems(doc: EvaluationQuestion): DeletedItem[] {
  const methodName = new Map(doc.evidenceMethods.map((m) => [m.id, m.name]));

  const items = doc.recycleBin.deletedNodes.map((entry, index): DeletedItem => {
    const { originPath, deletedAt } = entry;
    const obj = asRecord(entry.node);
    let kind = "Item";
    let label = "";

    if (originPath === "overallJudgement") {
      kind = "Overall Judgement";
      label = "Synthesis rubric";
    } else if (originPath === "mesoLayers") {
      kind = "Meso layer";
      label =
        obj.kind === "criteria"
          ? "Criteria layer"
          : obj.kind === "components"
            ? "Components layer"
            : "Meso layer";
    } else if (originPath.startsWith("mesoLayers/") && originPath.endsWith("/nodes")) {
      kind = "Criterion / Component";
      label = str(obj.name).trim() || "(unnamed)";
    } else if (originPath.endsWith("/evidenceLinks")) {
      kind = "Evidence link";
      label = methodName.get(str(obj.evidenceMethodId)) ?? "(evidence)";
    } else if (originPath.endsWith("/scenarios")) {
      kind = "Scenario";
      const parts = Array.isArray(obj.parts) ? obj.parts : [];
      const firstText = parts.find((p) => asRecord(p).kind === "text");
      label = str(asRecord(firstText).text).trim() || "(empty scenario)";
    } else if (originPath.includes("/evidenceTier/entries")) {
      kind = "Data description entry";
      label = str(obj.description).trim() || "(empty)";
    } else if (originPath.includes("/evidenceTier/methodLevelCells")) {
      kind = "Rubric level cell";
      label = str(obj.description).trim() || "(empty)";
    } else if (originPath.endsWith("/evidenceTier")) {
      kind = "Evidence tier";
      label = obj.shape === "list" ? "Data description list" : "Evidence-tier rubric";
    } else if (originPath === "records") {
      kind = "Decision record entry";
      label = str(obj.changeSummary).trim() || "(no summary)";
    } else if (originPath === "simCases") {
      kind = "SIMULATED Case";
      label = str(obj.label).trim() || "(unnamed case)";
    } else if (originPath === "critiques") {
      kind = "Imported critique";
      label = str(obj.reviewerLabel).trim() || "(unlabelled reviewer)";
    }

    return { index, kind, label, deletedAt, originPath };
  });

  // Most recent first; ties broken by insertion order (later = newer).
  return items.sort((a, b) =>
    a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : b.index - a.index,
  );
}

// ---- Restore (Slice 10, R-149/Q18/⚠Q56) --------------------------------------

/** The outcome of a restore attempt — surfaced to the Deleted view. */
export interface RestoreResult {
  restored: boolean;
  /** What was put back (for the success message). */
  kind?: string;
  /** Why nothing was restored (container gone / already present / ambiguous). */
  reason?: string;
}

/**
 * Put a RecycleBin entry back where it came from, by `originPath` (⚠Q56). The
 * item is restored only when its target container still exists and it is not
 * already present; otherwise the entry stays in the bin and a reason is
 * returned (e.g. "restore the layer first"). Inbound-link resolution is applied
 * where a restore could otherwise dangle:
 *  - a restored subordinate node with a `parentNodeId` whose superior node is
 *    gone has that rollup cleared (Invariant 18);
 *  - a restored node's cells are re-synced to the layer's **current** columns
 *    (the ⚠Q56 proposed default — columns may have changed since deletion);
 *  - a scenario / rubric-level cell / judgement scenario is refused when the
 *    column or cell it referenced no longer exists.
 * Tokens elsewhere that referenced a deleted node resolve live, so restoring the
 * node re-links them automatically (no active fix needed).
 *
 * Mutates `doc` (the store passes a clone). On success the entry is removed from
 * the bin.
 */
export function restoreDeletedItem(
  doc: EvaluationQuestion,
  index: number,
): RestoreResult {
  const entry = doc.recycleBin.deletedNodes[index];
  if (!entry) return { restored: false, reason: "That deleted item no longer exists." };
  const originPath = entry.originPath;
  const segments = originPath.split("/");
  const payload = entry.node;

  const done = (kind: string): RestoreResult => {
    doc.recycleBin.deletedNodes.splice(index, 1);
    return { restored: true, kind };
  };
  const fail = (reason: string): RestoreResult => ({ restored: false, reason });

  const nodeById = (id: string): MesoNode | undefined =>
    doc.mesoLayers.flatMap((l) => l.nodes).find((n) => n.id === id);
  const cellIn = (nodeId: string, cellId: string): Cell | undefined =>
    nodeById(nodeId)?.cells.find((c) => c.id === cellId);

  // --- Whole synthesis rubric --------------------------------------------------
  if (originPath === "overallJudgement") {
    if (doc.overallJudgement) {
      return fail("An Overall Judgement already exists — remove it before restoring this one.");
    }
    doc.overallJudgement = payload as OverallJudgement;
    delete doc.synthesisDeclined;
    return done("Overall Judgement");
  }

  // --- A judgement scenario ----------------------------------------------------
  if (originPath === "overallJudgement/scenarios") {
    const judgement = doc.overallJudgement;
    if (!judgement) return fail("The Overall Judgement this scenario belonged to no longer exists.");
    const scenario = payload as JudgementScenario;
    if (!judgement.continuum.columns.some((c) => c.id === scenario.yieldsColumnId)) {
      return fail("The judgement conclusion this scenario belonged to no longer exists.");
    }
    if (judgement.scenarios.some((s) => s.id === scenario.id)) {
      return fail("That scenario is already present.");
    }
    judgement.scenarios.push(scenario);
    reindexColumnScenarios(judgement.scenarios, scenario.yieldsColumnId);
    return done("Scenario");
  }

  // --- The whole superior meso layer -------------------------------------------
  if (originPath === "mesoLayers") {
    const layer = payload as MesoLayer;
    if (doc.mesoLayers.length >= 2) {
      return fail("Two meso layers already exist — remove one before restoring this layer.");
    }
    if (doc.mesoLayers.some((l) => l.tierOrder === layer.tierOrder)) {
      return fail("A layer already occupies that tier.");
    }
    doc.mesoLayers.push(layer);
    return done("Meso layer");
  }

  // --- A superior-node cell's inter-layer scenario -----------------------------
  // mesoLayers/{layerId}/nodes/{nodeId}/cells/{cellId}/scenarios
  if (
    segments[0] === "mesoLayers" &&
    originPath.includes("/cells/") &&
    originPath.endsWith("/scenarios")
  ) {
    const cell = cellIn(segments[3] ?? "", segments[5] ?? "");
    if (!cell) return fail("The rubric cell this scenario belonged to no longer exists.");
    return restoreCellScenario(cell, payload as Scenario, done, fail);
  }

  // --- A meso node (criterion / component) -------------------------------------
  if (originPath.startsWith("mesoLayers/") && originPath.endsWith("/nodes")) {
    const layer = doc.mesoLayers.find((l) => l.id === segments[1]);
    if (!layer) return fail("The layer this belonged to no longer exists — restore the layer first.");
    const node = payload as MesoNode;
    if (layer.nodes.some((n) => n.id === node.id)) return fail("That item is already in the framework.");
    // ⚠Q56 default: re-sync the restored node's cells to the current columns.
    syncNodeCellsToColumns(node, layer.continuum);
    // Inbound-link resolution: drop a rollup whose superior node is now gone.
    if (
      node.parentNodeId !== undefined &&
      !doc.mesoLayers.some((l) => l.nodes.some((n) => n.id === node.parentNodeId))
    ) {
      delete node.parentNodeId;
    }
    layer.nodes.push(node);
    layer.nodes.forEach((n, i) => {
      n.order = i;
    });
    return done("Criterion / Component");
  }

  // --- A J10 cell scenario -----------------------------------------------------
  // nodes/{nodeId}/cells/{cellId}/scenarios
  if (segments[0] === "nodes" && originPath.includes("/cells/") && originPath.endsWith("/scenarios")) {
    const cell = cellIn(segments[1] ?? "", segments[3] ?? "");
    if (!cell) return fail("The rubric cell this scenario belonged to no longer exists.");
    return restoreCellScenario(cell, payload as Scenario, done, fail);
  }

  // --- An evidence link --------------------------------------------------------
  if (segments[0] === "nodes" && originPath.endsWith("/evidenceLinks")) {
    const node = nodeById(segments[1] ?? "");
    if (!node) return fail("The criterion/component this evidence belonged to no longer exists.");
    const link = payload as EvidenceLink;
    if (node.evidenceLinks.some((l) => l.evidenceMethodId === link.evidenceMethodId)) {
      return fail("That Evidence/Method is already linked here.");
    }
    if (!doc.evidenceMethods.some((m) => m.id === link.evidenceMethodId)) {
      return fail("The Evidence/Method this link points to no longer exists.");
    }
    node.evidenceLinks.push(link);
    return done("Evidence link");
  }

  // --- Evidence-tier content: a list entry -------------------------------------
  if (segments[0] === "nodes" && originPath.endsWith("/evidenceTier/entries")) {
    const tier = nodeById(segments[1] ?? "")?.evidenceTier;
    if (tier?.shape !== "list") {
      return fail("The data-description list this entry belonged to no longer exists.");
    }
    (tier as DataDescriptionList).entries.push(
      payload as DataDescriptionList["entries"][number],
    );
    return done("Data description entry");
  }

  // --- Evidence-tier content: a rubric level cell ------------------------------
  if (segments[0] === "nodes" && originPath.endsWith("/evidenceTier/methodLevelCells")) {
    const tier = nodeById(segments[1] ?? "")?.evidenceTier;
    if (tier?.shape !== "rubric") {
      return fail("The evidence-tier rubric this cell belonged to no longer exists.");
    }
    const cell = payload as EvidenceTierRubric["methodLevelCells"][number];
    if (!(tier as EvidenceTierRubric).continuum.columns.some((c) => c.id === cell.columnId)) {
      return fail("The rubric column this cell belonged to no longer exists.");
    }
    (tier as EvidenceTierRubric).methodLevelCells.push(cell);
    return done("Rubric level cell");
  }

  // --- A V2 decision-record entry (Q64) ----------------------------------------
  if (originPath === "records") {
    const record = payload as RecordEntry;
    if (doc.records.some((r) => r.id === record.id)) {
      return fail("That record entry is already present.");
    }
    doc.records.push(record);
    return done("Decision record entry");
  }

  // --- A V2 SimCase (Q62/Q67) ---------------------------------------------------
  if (originPath === "simCases") {
    const simCase = payload as SimCase;
    if (doc.simCases.some((c) => c.id === simCase.id)) {
      return fail("That case is already present.");
    }
    doc.simCases.push(simCase);
    return done("SIMULATED Case");
  }

  // --- A V2 imported Critique (Q65) ---------------------------------------------
  if (originPath === "critiques") {
    const critique = payload as Critique;
    if (doc.critiques.some((c) => c.id === critique.id)) {
      return fail("That critique is already present.");
    }
    doc.critiques.push(critique);
    return done("Imported critique");
  }

  // --- A whole evidence tier ---------------------------------------------------
  if (segments[0] === "nodes" && originPath.endsWith("/evidenceTier")) {
    const node = nodeById(segments[1] ?? "");
    if (!node) return fail("The criterion/component this evidence tier belonged to no longer exists.");
    if (node.evidenceTier) {
      return fail("This criterion already has an evidence tier — remove it before restoring.");
    }
    node.evidenceTier = payload as EvidenceTier;
    return done("Evidence tier");
  }

  return fail("This kind of item can't be restored automatically.");
}

/** Restore a Scenario into a rubric cell, guarding against a duplicate. */
function restoreCellScenario(
  cell: Cell,
  scenario: Scenario,
  done: (kind: string) => RestoreResult,
  fail: (reason: string) => RestoreResult,
): RestoreResult {
  if (cell.scenarios.some((s) => s.id === scenario.id)) {
    return fail("That scenario is already present.");
  }
  cell.scenarios.push(scenario);
  cell.scenarios.forEach((s, i) => {
    s.order = i;
  });
  return done("Scenario");
}

/** Re-number the scenarios of one judgement column by array position. */
function reindexColumnScenarios(scenarios: JudgementScenario[], columnId: string): void {
  scenarios
    .filter((s) => s.yieldsColumnId === columnId)
    .forEach((s, i) => {
      s.order = i;
    });
}

/**
 * Re-sync a restored node's cells to a continuum's current columns (⚠Q56): keep
 * cells whose column still exists (with their content), drop cells for removed
 * columns, and add a fresh open cell for any new column — mirroring the store's
 * `syncCellsToColumns` so Invariant 5 (one cell per column) holds after restore.
 */
function syncNodeCellsToColumns(node: MesoNode, continuum: Continuum): void {
  const columnIds = new Set(continuum.columns.map((c) => c.id));
  node.cells = node.cells.filter((cell) => columnIds.has(cell.columnId));
  if (node.importance) {
    node.importance = node.importance.filter((m) => columnIds.has(m.columnId));
  }
  const covered = new Set(node.cells.map((c) => c.columnId));
  for (const column of continuum.columns) {
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
