import { orderedColumns } from "./continuum";
import { findColumnInAnyLayer, orderedLayersForOutput, subordinateLayer } from "./layers";
import { mixedStrategyLabel } from "./mixedMethods";
import { labelForRef } from "./recordRef";
import { scenarioPlainText } from "./scenario";
import { SIMULATED_LABEL } from "./simCase";
import { warrantSummary } from "./warrant";
import type {
  Column,
  Continuum,
  EvaluationQuestion,
  EvidenceMethod,
  MesoLayer,
  MesoNode,
  RecordEntry,
  RubricCellCondition,
} from "./schema";

/**
 * Output shaping (Slice 8, J12 — R-115–R-124, Q21/Q26). The Evidence Matrix and
 * Output B / rubric plan are **views** computed from the model, never stored
 * (SPEC §7). Everything here is pure so the shaping — mixed-source bracketing,
 * dedupe merge, two-layer ordering, CSV/Markdown serialisation — is Vitest-
 * testable without a DOM. The React view renders these shapes; the serialisers
 * are the client-side exports (no backend, Arch §3).
 */

// ---- Shared label helpers ----------------------------------------------------

/**
 * A method's display label in the outputs. A combined mixed-methods source shows
 * its sub-methods in brackets — `Mixed (M1 + M2 + M3)` (Q26, GWT-12.2) — resolved
 * live from the pool; a plain method is just its name.
 */
export function methodOutputLabel(
  method: EvidenceMethod,
  pool: EvidenceMethod[],
): string {
  const subs = method.memberSubMethods ?? [];
  if (!method.isMixedMethodsSource || subs.length === 0) return method.name;
  const memberNames = subs.map(
    (s) => pool.find((m) => m.id === s.sourceMethodId)?.name ?? "(unnamed)",
  );
  return `${method.name} (${memberNames.join(" + ")})`;
}

/** The process description shown in the matrix's second column (R-116). */
function methodProcess(method: EvidenceMethod): string {
  return (method.whatWillBeDone ?? method.mixedMethodsExplanation ?? "").trim();
}

// ---- Sufficient Bar in the printouts (Q51 notes 2/3) -------------------------

/** The plain-text divider a Markdown table can't draw as a gridline — the
 *  Sufficient Bar made explicit in the editable output (Q51 note 2). */
export const SUFFICIENT_BAR_MARKER = "── Sufficient Bar ──";

export interface BarSplit {
  /** Columns at or below the Sufficient Bar, left→right. */
  below: Column[];
  /** Columns above the Sufficient Bar, left→right. */
  above: Column[];
}

/**
 * A continuum's columns split by the Sufficient Bar (Q51 note 2 — the bar must
 * be visible in Output B). `keep` filters to the columns a given view renders
 * (e.g. a node's *included* conclusions); the split preserves below-then-above
 * order so the bar always sits between the two groups.
 */
export function columnsByBar(
  continuum: Continuum,
  keep?: (column: Column) => boolean,
): BarSplit {
  const columns = orderedColumns(continuum).filter((c) => (keep ? keep(c) : true));
  const bar = continuum.sufficientBarAfterOrdinal;
  return {
    below: columns.filter((c) => c.ordinal <= bar),
    above: columns.filter((c) => c.ordinal > bar),
  };
}

// ---- Evidence Matrix (Output A) ----------------------------------------------

export interface MatrixColumn {
  nodeId: string;
  name: string;
}

export interface MatrixRow {
  /** A stable key for React — the representative method's id. */
  key: string;
  label: string;
  process: string;
  /** Which matrix columns (subordinate nodes) this row is marked against. */
  markedNodeIds: string[];
}

export interface EvidenceMatrix {
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

/**
 * Dedupe-linked methods (R-081/R-082) are the *same* method described twice, so
 * they merge into one matrix row. Group the pool into dedupe-connected
 * components; each component becomes at most one row.
 */
function dedupeComponents(pool: EvidenceMethod[]): EvidenceMethod[][] {
  const byId = new Map(pool.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const components: EvidenceMethod[][] = [];
  for (const method of pool) {
    if (seen.has(method.id)) continue;
    const component: EvidenceMethod[] = [];
    const stack = [method];
    seen.add(method.id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const linkedId of current.dedupeLinkedIds ?? []) {
        if (!seen.has(linkedId) && byId.has(linkedId)) {
          seen.add(linkedId);
          stack.push(byId.get(linkedId)!);
        }
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * The Evidence Matrix (R-116/R-117, Q26): rows = Evidence/Methods, columns =
 * the subordinate layer's nodes (evidence attaches there, Q33 — in a two-layer
 * framework these are the evidence-bearing nodes, not the superior ones). A
 * method is *marked* against a node when it is linked to it. Mixed sources carry
 * their sub-methods in brackets; dedupe-linked methods merge into one row; a
 * method with no link anywhere (e.g. a sub-method dropped from the container,
 * Q38) does not get its own row — it only survives in a combined source's
 * brackets.
 */
export function evidenceMatrix(doc: EvaluationQuestion): EvidenceMatrix {
  const layer = subordinateLayer(doc);
  const nodes = [...(layer?.nodes ?? [])].sort((a, b) => a.order - b.order);
  const columns: MatrixColumn[] = nodes.map((n) => ({ nodeId: n.id, name: n.name }));

  // methodId → the subordinate nodes it is linked to.
  const linkedNodesByMethod = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const link of node.evidenceLinks) {
      const set = linkedNodesByMethod.get(link.evidenceMethodId) ?? new Set();
      set.add(node.id);
      linkedNodesByMethod.set(link.evidenceMethodId, set);
    }
  }

  const poolIndex = new Map(doc.evidenceMethods.map((m, i) => [m.id, i]));
  const rows: MatrixRow[] = [];
  for (const component of dedupeComponents(doc.evidenceMethods)) {
    const marked = new Set<string>();
    for (const member of component) {
      for (const nodeId of linkedNodesByMethod.get(member.id) ?? []) marked.add(nodeId);
    }
    if (marked.size === 0) continue; // not present at the evidence level (Q38)
    // The representative is the earliest-in-pool member — stable label/order.
    const representative = [...component].sort(
      (a, b) => (poolIndex.get(a.id) ?? 0) - (poolIndex.get(b.id) ?? 0),
    )[0]!;
    rows.push({
      key: representative.id,
      label: methodOutputLabel(representative, doc.evidenceMethods),
      process: methodProcess(representative),
      markedNodeIds: nodes.filter((n) => marked.has(n.id)).map((n) => n.id),
    });
  }
  rows.sort((a, b) => (poolIndex.get(a.key) ?? 0) - (poolIndex.get(b.key) ?? 0));
  return { columns, rows };
}

// ---- Justifications page (Output A, page 2 — R-117, Q51) ----------------------

/** One Evidence/Method's fit under a criterion (R-117). `mixedStrategy`, when
 *  present, surfaces the mixed-methods type/custom name that no output showed
 *  before the Slice-8 post-fixes (Q51 orphaned-data audit). */
export interface JustificationEntry {
  methodLabel: string;
  justification: string;
  mixedStrategy?: string;
}

/**
 * The criterion-first justifications group (Q51 note 1): the criterion "opens"
 * and encompasses all its Evidence/Methods (merged-cell style in the HTML).
 * Carries the criterion's three warrant boxes (linkToQuestion/linkToValues/
 * decisionsOrUse — R-050–R-052) and its sub-methods note (R-168), all of which
 * were typed in J4/J9 but appeared in no output before (Q51 audit — "the
 * justifications should include all of the information written in the boxes
 * about that criterion"). Empty strings mean unset; the renderer omits blanks.
 */
export interface CriterionJustification {
  nodeId: string;
  nodeName: string;
  linkToQuestion: string;
  linkToValues: string;
  decisionsOrUse: string;
  subMethodsNote: string;
  entries: JustificationEntry[];
}

/**
 * Justifications grouped criterion-first (R-117, Q51): one group per subordinate
 * node (evidence attaches there, Q33), in node order, each carrying its warrant
 * boxes and its per-link fit justifications in link order.
 */
export function justificationsByCriterion(
  doc: EvaluationQuestion,
): CriterionJustification[] {
  const layer = subordinateLayer(doc);
  const nodes = [...(layer?.nodes ?? [])].sort((a, b) => a.order - b.order);
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  return nodes.map((node) => ({
    nodeId: node.id,
    nodeName: node.name,
    linkToQuestion: node.linkToQuestion,
    linkToValues: node.linkToValues,
    decisionsOrUse: node.decisionsOrUse,
    subMethodsNote: node.subMethodsNote ?? "",
    entries: node.evidenceLinks.map((link) => {
      const method = methodById.get(link.evidenceMethodId);
      const strategy = method ? mixedStrategyLabel(method) : undefined;
      return {
        methodLabel: method
          ? methodOutputLabel(method, doc.evidenceMethods)
          : "(unknown method)",
        justification: link.fitJustification,
        ...(strategy !== undefined ? { mixedStrategy: strategy } : {}),
      };
    }),
  }));
}

// ---- Cell conditions in the outputs (Slice 13, R-COND-12) --------------------

/**
 * A one-line human-readable summary of a cell's applicability condition for the
 * derived outputs (R-COND-12). Boolean mode shows the canonical plain English;
 * prose mode shows the prose. Present defeasible qualifiers are appended. An
 * empty condition returns "" so the renderer omits it. Conditions are derived
 * from the stored document like every other output — never a separate store.
 */
export function conditionSummary(condition: RubricCellCondition | undefined): string {
  if (!condition) return "";
  const parts: string[] = [];
  if (condition.mode === "boolean" && condition.booleanLogic) {
    const pe = condition.booleanLogic.plainEnglish.trim();
    if (pe !== "") parts.push(pe);
  } else if ((condition.proseDescription ?? "").trim() !== "") {
    parts.push(condition.proseDescription!.trim());
  }
  const asText = (c: RubricCellCondition["typicallyWhen"]): string =>
    typeof c === "string" ? c.trim() : (c?.plainEnglish.trim() ?? "");
  if (condition.typicallyWhen && asText(condition.typicallyWhen) !== "")
    parts.push(`typically when ${asText(condition.typicallyWhen)}`);
  if (condition.unless && asText(condition.unless.condition) !== "")
    parts.push(`unless ${asText(condition.unless.condition)} → ${condition.unless.action}`);
  if (condition.exception && asText(condition.exception.condition) !== "")
    parts.push(
      `exception ${asText(condition.exception.condition)} → ${condition.exception.action}`,
    );
  const warrant = condition.warrant;
  if (warrant && (warrant.text.trim() !== "" || warrant.source.trim() !== ""))
    parts.push(`rationale: ${warrantSummary(warrant)}`);
  return parts.join("; ");
}

// ---- Output B / rubric plan (R-119–R-123) ------------------------------------

export interface OutputNode {
  layer: MesoLayer;
  node: MesoNode;
}

/**
 * Every meso node paired with its layer, in Output-B order: all components
 * before all criteria (R-123, Q15), and by node order within each layer. The
 * evidence tier lives on the subordinate layer, so only its nodes carry one.
 */
export function orderedNodesForOutput(doc: EvaluationQuestion): OutputNode[] {
  return orderedLayersForOutput(doc).flatMap((layer) =>
    [...layer.nodes]
      .sort((a, b) => a.order - b.order)
      .map((node) => ({ layer, node })),
  );
}

/** The recorded "may not provide confident clarity" notes (R-096) surfaced for
 *  the readiness/Output-B view (R-159): node + column + note text. */
export interface ClarityNote {
  nodeName: string;
  columnLabel: string;
  note: string;
}

export function clarityNotes(doc: EvaluationQuestion): ClarityNote[] {
  const notes: ClarityNote[] = [];
  for (const layer of doc.mesoLayers) {
    const columnLabel = (columnId: string) =>
      layer.continuum.columns.find((c) => c.id === columnId)?.label ?? "(column)";
    for (const node of [...layer.nodes].sort((a, b) => a.order - b.order)) {
      for (const cell of node.cells) {
        if ((cell.clarityNote ?? "").trim() !== "") {
          notes.push({
            nodeName: node.name,
            columnLabel: columnLabel(cell.columnId),
            note: cell.clarityNote!.trim(),
          });
        }
      }
    }
  }
  return notes;
}

// ---- V2 record layer in exports (docs/ROADMAP-V2.md §1.4, Q64) --------------

/**
 * The non-suppressible line every record-bearing export must carry, e.g.
 * `Decision record: 14 entries, 3 withheld.` — present whenever the document
 * has any records at all, even if every one of them is withheld. There is
 * deliberately no parameter here to hide or omit it: a gap the reader can see
 * is a different object from a gap they cannot (extension spec decision 3).
 */
export function recordWithheldLine(records: RecordEntry[]): string {
  const withheld = records.filter((r) => !r.includeInExport).length;
  return `Decision record: ${records.length} ${records.length === 1 ? "entry" : "entries"}, ${withheld} withheld.`;
}

/** The entries an export actually lists — everything else is covered only by
 *  the withheld count above, never rendered individually. */
export function includedRecordEntries(records: RecordEntry[]): RecordEntry[] {
  return records.filter((r) => r.includeInExport);
}

// ---- Serialisers (client-side exports — R-118/R-124, Q21) --------------------

/** Wrap a CSV field, quoting only when needed (comma, quote, or newline). */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The Evidence Matrix as CSV (R-118): name, process, then one column per node
 *  with an `X` where the method is marked against that node. */
export function matrixToCsv(matrix: EvidenceMatrix): string {
  const header = ["Evidence / Method", "Process", ...matrix.columns.map((c) => c.name)];
  const lines = [header.map(csvField).join(",")];
  for (const row of matrix.rows) {
    const marks = matrix.columns.map((c) => (row.markedNodeIds.includes(c.nodeId) ? "X" : ""));
    lines.push([row.label, row.process, ...marks].map(csvField).join(","));
  }
  return lines.join("\r\n");
}

/** Escape a Markdown table cell (pipes and newlines would break the row). */
function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * The whole framework as editable Markdown (Q21 — the editable output). Includes
 * the question, the Evidence Matrix and justifications, the synthesis (if any),
 * and the per-node rubric plan in components-then-criteria order (R-119–R-123)
 * with each node's evidence tier and any clarity notes (R-159). GitHub-flavoured
 * pipe tables (⚠Q51).
 */
export function toMarkdown(
  doc: EvaluationQuestion,
  opts?: { includeDecisionRecord?: boolean },
): string {
  const out: string[] = [];
  const p = (line = "") => out.push(line);

  p(`# ${doc.title || "Evaluation Question"}`);
  p();
  if (doc.questionText.trim() !== "") {
    p(`> ${doc.questionText.trim()}`);
    p();
  }

  // Evidence Matrix (Output A) ------------------------------------------------
  const matrix = evidenceMatrix(doc);
  p(`## Evidence Matrix`);
  p();
  if (matrix.rows.length === 0) {
    p("_No Evidence/Methods yet._");
  } else {
    const head = ["Evidence / Method", "Process", ...matrix.columns.map((c) => c.name)];
    p(`| ${head.map(mdCell).join(" | ")} |`);
    p(`| ${head.map(() => "---").join(" | ")} |`);
    for (const row of matrix.rows) {
      const marks = matrix.columns.map((c) =>
        row.markedNodeIds.includes(c.nodeId) ? "X" : "",
      );
      p(`| ${[row.label, row.process, ...marks].map(mdCell).join(" | ")} |`);
    }
  }
  p();

  // Justifications (Output A, page 2) — criterion-first (Q51 note 1). GFM pipe
  // tables can't merge cells, so each criterion "opens" as a `###` heading and
  // its Evidence/Methods are a two-column table beneath (chosen over repeating
  // the criterion label per row — more readable). The three warrant boxes and
  // the sub-methods note are surfaced here (previously output-orphaned, Q51).
  const groups = justificationsByCriterion(doc);
  if (groups.length > 0) {
    p(`## Evidence justifications`);
    p();
    for (const g of groups) {
      p(`### ${g.nodeName || "(unnamed criterion)"}`);
      if (g.linkToQuestion.trim() !== "")
        p(`- **Links to the Evaluation Question:** ${g.linkToQuestion.trim()}`);
      if (g.linkToValues.trim() !== "")
        p(`- **Links to values:** ${g.linkToValues.trim()}`);
      if (g.decisionsOrUse.trim() !== "")
        p(`- **Decisions or use:** ${g.decisionsOrUse.trim()}`);
      if (g.subMethodsNote.trim() !== "")
        p(`- **Sub-methods note:** ${g.subMethodsNote.trim()}`);
      p();
      if (g.entries.length === 0) {
        p(`_No Evidence/Methods linked._`);
      } else {
        p(`| Evidence / Method | Justification |`);
        p(`| --- | --- |`);
        for (const e of g.entries) {
          const label = e.mixedStrategy
            ? `${e.methodLabel} — _${e.mixedStrategy}_`
            : e.methodLabel;
          p(`| ${mdCell(label)} | ${mdCell(e.justification)} |`);
        }
      }
      p();
    }
  }

  // Overall Judgement / synthesis (Output B, page 1 + full) -------------------
  const judgement = doc.overallJudgement;
  if (judgement) {
    p(`## Overall Judgement`);
    p();
    if ((judgement.freeTextOverride ?? "").trim() !== "") {
      p(judgement.freeTextOverride!.trim());
      p();
    } else {
      const { below, above } = columnsByBar(judgement.continuum);
      const nameFor = (id: string) =>
        doc.mesoLayers.flatMap((l) => l.nodes).find((n) => n.id === id)?.name ?? "(unnamed)";
      // A synthesis token's column may belong to either meso layer now that both
      // feed the judgement (Q53 reading point 2) — resolve against the owner.
      const columnLabelFor = (id: string) =>
        findColumnInAnyLayer(doc, id)?.label ?? "(column)";
      const emitConclusion = (col: Column) => {
        p(`### ${col.label || "(unnamed conclusion)"}`);
        if (judgement.decisionRowEnabled) {
          const decision = judgement.decisionCells.find((c) => c.columnId === col.id)?.text;
          if ((decision ?? "").trim() !== "") p(`- **Decision:** ${decision!.trim()}`);
        }
        const plain = judgement.plainDescriptionCells.find((c) => c.columnId === col.id)?.text;
        if ((plain ?? "").trim() !== "") p(`- **Plain description:** ${plain!.trim()}`);
        const scenarios = judgement.scenarios
          .filter((s) => s.yieldsColumnId === col.id)
          .sort((a, b) => a.order - b.order);
        for (const s of scenarios) {
          p(`- _Condition:_ ${scenarioPlainText(s.parts, nameFor, columnLabelFor)}`);
        }
        p();
      };
      for (const col of below) emitConclusion(col);
      // The Sufficient Bar made explicit between the below- and above-bar
      // conclusions (Q51 note 2 — the bar must print in Output B).
      if (below.length > 0 && above.length > 0) {
        p(`**${SUFFICIENT_BAR_MARKER}**`);
        p();
      }
      for (const col of above) emitConclusion(col);
    }
  }

  // Per-node rubric plan (components first, then criteria — R-122/R-123) -------
  p(`## Rubric plan`);
  p();
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const nodeById = new Map(doc.mesoLayers.flatMap((l) => l.nodes).map((n) => [n.id, n]));
  for (const { layer, node } of orderedNodesForOutput(doc)) {
    const kindLabel = layer.kind === "criteria" ? "Criterion" : "Component";
    p(`### ${kindLabel}: ${node.name || "(unnamed)"}`);
    p();
    // Subordinate scenarios reference methods; superior inter-layer scenarios
    // reference subordinate nodes (Q54). Resolve both, columns against the
    // owning layer (Q53 reading point 2).
    const nameFor = (id: string) =>
      methodById.get(id)?.name ?? nodeById.get(id)?.name ?? "(unnamed)";
    const columnLabelFor = (id: string) =>
      findColumnInAnyLayer(doc, id)?.label ?? "(column)";
    const includedIds = new Set(
      node.cells.filter((c) => c.included).map((c) => c.columnId),
    );
    const { below, above } = columnsByBar(layer.continuum, (col) =>
      includedIds.has(col.id),
    );
    const emitConclusion = (col: Column) => {
      const cell = node.cells.find((c) => c.columnId === col.id);
      p(`- **${col.label || "(unnamed)"}** — ${(cell?.plainDescription ?? "").trim()}`);
      for (const s of [...(cell?.scenarios ?? [])].sort((a, b) => a.order - b.order)) {
        const text = scenarioPlainText(s.parts, nameFor, columnLabelFor).trim();
        if (text !== "") p(`  - _Scenario:_ ${text}`);
      }
      // When this conclusion applies (Slice 13, R-COND-12) — a footnote-style
      // line beneath the conclusion; derived from the cell's stored condition.
      const cond = conditionSummary(cell?.condition);
      if (cond !== "") p(`  - _Condition:_ ${mdCell(cond)}`);
      // V2 extension spec §3.2: the distinguishing case sits alongside the
      // descriptor it qualifies, same footnote style as the condition line.
      const distinguishing = (cell?.distinguishingCase ?? "").trim();
      if (distinguishing !== "") p(`  - _Distinguishing case:_ ${mdCell(distinguishing)}`);
    };
    for (const col of below) emitConclusion(col);
    // The Sufficient Bar between the below- and above-bar conclusions (Q51 note 2).
    if (below.length > 0 && above.length > 0) p(`- ${SUFFICIENT_BAR_MARKER}`);
    for (const col of above) emitConclusion(col);
    // Evidence tier (subordinate layer only) ----------------------------------
    const tier = node.evidenceTier;
    if (tier) {
      p();
      if (tier.shape === "list") {
        p(`**Evidence plan (data description list):**`);
        for (const entry of tier.entries) {
          const label = entry.evidenceMethodId
            ? nameFor(entry.evidenceMethodId)
            : "(no specific method)";
          p(`- ${mdCell(label)}: ${entry.description.trim()}`);
        }
      } else {
        p(`**Evidence-tier rubric:**`);
        // A bar-marker column between the below- and above-bar levels (Q51 note 2).
        const { below, above } = columnsByBar(tier.continuum);
        const headerCols = [
          ...below.map((c) => c.label || "(unnamed)"),
          SUFFICIENT_BAR_MARKER,
          ...above.map((c) => c.label || "(unnamed)"),
        ];
        p(`| Evidence / Method | ${headerCols.map(mdCell).join(" | ")} |`);
        p(`| --- | ${headerCols.map(() => "---").join(" | ")} |`);
        const descFor = (methodId: string, columnId: string) =>
          tier.methodLevelCells.find(
            (mc) => mc.evidenceMethodId === methodId && mc.columnId === columnId,
          )?.description ?? "";
        for (const link of node.evidenceLinks) {
          const method = methodById.get(link.evidenceMethodId);
          const cells = [
            ...below.map((c) => descFor(link.evidenceMethodId, c.id)),
            "┃",
            ...above.map((c) => descFor(link.evidenceMethodId, c.id)),
          ];
          p(
            `| ${mdCell(method ? methodOutputLabel(method, doc.evidenceMethods) : "(unknown)")} | ${cells
              .map(mdCell)
              .join(" | ")} |`,
          );
        }
      }
    }
    p();
  }

  // Clarity notes (R-159) -----------------------------------------------------
  const notes = clarityNotes(doc);
  if (notes.length > 0) {
    p(`## Clarity notes`);
    p();
    p(`These conclusions were flagged as possibly not clearly evidenced (R-096):`);
    p();
    for (const n of notes) {
      p(`- **${mdCell(n.nodeName)} — ${mdCell(n.columnLabel)}:** ${mdCell(n.note)}`);
    }
    p();
  }

  // Decision record (V2, Q64) — appears whenever any record exists; the
  // withheld count is never suppressible (docs/ROADMAP-V2.md §1.4).
  // Suppressed only by the State-as-at export (§3.3), which shows its own
  // windowed delta section instead of this whole-history one, so the two
  // never appear side by side saying different things about the same word
  // "changes".
  if ((opts?.includeDecisionRecord ?? true) && doc.records.length > 0) {
    p(`## Decision record`);
    p();
    p(`**${recordWithheldLine(doc.records)}**`);
    p();
    const included = [...includedRecordEntries(doc.records)].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );
    for (const entry of included) {
      const when = entry.timestamp.slice(0, 10);
      const who = entry.author.trim() !== "" ? entry.author.trim() : "(unattributed)";
      p(
        `- **${when}, ${mdCell(who)} (${entry.prompt}):** ${mdCell(labelForRef(doc, entry.elementRef))} — ${mdCell(entry.changeSummary)}. _Reason:_ ${mdCell(entry.reason)}`,
      );
    }
    p();
  }

  // SIMULATED Cases (V2, Q62/Q67) — the label is unsuppressible everywhere a
  // SimCase is rendered (extension spec §2/§5.1). authorNotes/expectedToFail
  // are the author's own private markers and are never shown here.
  if (doc.simCases.length > 0) {
    p(`## Cases (${SIMULATED_LABEL})`);
    p();
    p(
      `_Every case below is a hypothetical the author wrote for testing the framework's logic — never a recorded evaluation result._`,
    );
    p();
    for (const c of [...doc.simCases].sort((a, b) => a.label.localeCompare(b.label))) {
      p(`- **${mdCell(c.label)} (${SIMULATED_LABEL}):** ${mdCell(c.prose)}`);
    }
    p();
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
