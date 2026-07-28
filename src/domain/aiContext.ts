import type { AiAppliesTo, AiPlaceholder } from "./aiTemplates";
import { negativeColumns, orderedColumns, positiveColumns } from "./continuum";
import { findColumnInAnyLayer, subordinateLayer, superiorLayer } from "./layers";
import { evidenceMatrix, methodOutputLabel } from "./output";
import { scenarioPlainText } from "./scenario";
import type { Continuum, EvaluationQuestion, MesoNode } from "./schema";

/**
 * The AI hand-off **context serialiser** (Slice 11, R-140; AI-HANDOFF.md §2).
 * Turns the target slice of the framework into plain text for a prompt — no
 * JSON, no UUIDs (the user round-trips by *reading*, not by id), never another
 * Evaluation Question's content (there is only one per document anyway). Pure
 * and Vitest-testable; the view renders the values into a chosen template.
 *
 * HARD non-goal: this composes context to copy OUT only. Nothing is sent to any
 * model, and nothing an AI returns is applied automatically (Arch C-7).
 */

/** A place in the framework a prompt can be composed about (AI-HANDOFF.md §1).
 *  `kind` matches a template's `appliesTo`; `key` is a stable UI selector. */
export interface HandoffTarget {
  key: string;
  kind: AiAppliesTo;
  label: string;
  nodeId?: string;
}

/** Singular on-screen label for the subordinate layer's kind (R-048). */
function kindLabelOf(doc: EvaluationQuestion): string {
  return subordinateLayer(doc)?.kind === "components" ? "component" : "criterion";
}

/** Plural on-screen label — "criteria" (never "criterions") per the glossary. */
function kindLabelPluralOf(doc: EvaluationQuestion): string {
  return subordinateLayer(doc)?.kind === "components" ? "components" : "criteria";
}

/**
 * Every target a "Copy prompt" path exists for (⚠Q57 (b)): the Evaluation
 * Question itself, the value continuum, each **subordinate** meso node (they
 * carry the descriptions and evidence a template critiques — superior/structure
 * nodes are excluded in v1), and the Overall Judgement when one exists.
 */
export function handoffTargets(doc: EvaluationQuestion): HandoffTarget[] {
  const targets: HandoffTarget[] = [
    {
      key: "eq",
      kind: "evaluationQuestion",
      label: `Evaluation Question — ${doc.title || "(untitled)"}`,
    },
  ];
  const layer = subordinateLayer(doc);
  const kindLabel = kindLabelOf(doc);
  if (layer) {
    targets.push({ key: "continuum", kind: "continuum", label: "Value continuum" });
    for (const node of [...layer.nodes].sort((a, b) => a.order - b.order)) {
      targets.push({
        key: node.id,
        kind: "mesoNode",
        label: `${cap(kindLabel)} — ${node.name || "(unnamed)"}`,
        nodeId: node.id,
      });
    }
  }
  if (doc.overallJudgement) {
    targets.push({ key: "judgement", kind: "overallJudgement", label: "Overall Judgement" });
  }
  return targets;
}

const NA = "(not applicable to this part of the framework)";

/**
 * Serialise every placeholder the templates can reference (AI-HANDOFF.md §3)
 * for one target. Every key is always present so any template renders fully;
 * values not relevant to the target read as a short "(not applicable…)" note.
 */
export function serializeContext(
  doc: EvaluationQuestion,
  target: HandoffTarget,
): Record<AiPlaceholder, string> {
  const layer = subordinateLayer(doc);
  const kindLabel = kindLabelOf(doc);
  const kindLabelPlural = kindLabelPluralOf(doc);
  const node =
    target.kind === "mesoNode"
      ? layer?.nodes.find((n) => n.id === target.nodeId)
      : undefined;

  const continuum =
    target.kind === "overallJudgement"
      ? doc.overallJudgement?.continuum
      : layer?.continuum;

  return {
    evaluationQuestion:
      doc.questionText.trim() || "(the evaluation question has not been written yet)",
    valueLanguage:
      (doc.valueLanguage ?? []).map((s) => `“${s.text}”`).join(", ") ||
      "(no value-language highlighted)",
    nodeName: node ? node.name || "(unnamed)" : "",
    nodeKindLabel: kindLabel,
    nodeKindLabelPlural: kindLabelPlural,
    continuumTable: continuum ? describeContinuum(continuum) : "(no continuum yet)",
    cellDescriptions:
      node && layer ? describeCells(node, layer.continuum) : NA,
    evidenceList: node ? describeEvidenceList(doc, node) : NA,
    evidenceTier: node ? describeTier(doc, node) : NA,
    synthesisRubric: describeSynthesis(doc),
    ancestorChain: describeAncestors(doc, target, node),
    evidenceMatrix: describeMatrix(doc, kindLabel, kindLabelPlural),
    glossaryTerms: glossaryFor(target.kind),
  };
}

// ---- Plain-text describers (no ids, ever) ------------------------------------

const BAR = "—— Sufficient Bar ——";

function label(text: string): string {
  return text.trim() || "(unnamed)";
}

function describeContinuum(continuum: Continuum): string {
  const below = negativeColumns(continuum).map((c) => label(c.label));
  const above = positiveColumns(continuum).map((c) => label(c.label));
  return [
    `Below the Sufficient Bar (not yet sufficient): ${below.join(" | ")}`,
    `Above the Sufficient Bar (sufficient or better): ${above.join(" | ")}`,
  ].join("\n");
}

function describeCells(node: MesoNode, continuum: Continuum): string {
  const plainFor = (columnId: string) =>
    node.cells.find((c) => c.columnId === columnId)?.plainDescription?.trim() ||
    "(no description yet)";
  const included = new Set(node.cells.filter((c) => c.included).map((c) => c.columnId));
  const below = negativeColumns(continuum).filter((c) => included.has(c.id));
  const above = positiveColumns(continuum).filter((c) => included.has(c.id));
  const line = (columnLabel: string, columnId: string) =>
    `- ${label(columnLabel)}: ${plainFor(columnId)}`;
  const out = below.map((c) => line(c.label, c.id));
  if (below.length > 0 && above.length > 0) out.push(`- ${BAR}`);
  out.push(...above.map((c) => line(c.label, c.id)));
  return out.length > 0 ? out.join("\n") : "(no conclusions are open for this node yet)";
}

function describeEvidenceList(doc: EvaluationQuestion, node: MesoNode): string {
  if (node.evidenceLinks.length === 0) return "(no Evidence / Methods linked yet)";
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  return node.evidenceLinks
    .map((link) => {
      const method = methodById.get(link.evidenceMethodId);
      if (!method) return "- (unknown method)";
      const process =
        (method.whatWillBeDone ?? method.mixedMethodsExplanation ?? "").trim() ||
        "(process not described yet)";
      return `- ${methodOutputLabel(method, doc.evidenceMethods)}: ${process}`;
    })
    .join("\n");
}

function describeTier(doc: EvaluationQuestion, node: MesoNode): string {
  const tier = node.evidenceTier;
  if (!tier) return "(no evidence tier chosen yet)";
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const nameOf = (methodId: string) =>
    methodById.get(methodId)
      ? methodOutputLabel(methodById.get(methodId)!, doc.evidenceMethods)
      : "(unknown method)";

  if (tier.shape === "list") {
    if (tier.entries.length === 0) return "Data description list: (no entries yet)";
    const lines = tier.entries.map((e) => {
      const name = e.evidenceMethodId ? nameOf(e.evidenceMethodId) : "(no specific method)";
      return `- ${name}: ${e.description.trim() || "(not described yet)"}`;
    });
    return ["Data description list:", ...lines].join("\n");
  }

  const cols = orderedColumns(tier.continuum);
  const lines: string[] = [
    `Evidence-tier rubric — levels: ${cols.map((c) => label(c.label)).join(" | ")}`,
  ];
  for (const link of node.evidenceLinks) {
    const described = cols
      .map((c) => {
        const desc = tier.methodLevelCells.find(
          (mc) => mc.evidenceMethodId === link.evidenceMethodId && mc.columnId === c.id,
        )?.description;
        return desc && desc.trim() !== "" ? `${label(c.label)}: ${desc.trim()}` : null;
      })
      .filter((x): x is string => x !== null);
    lines.push(
      `- ${nameOf(link.evidenceMethodId)}: ${
        described.length > 0 ? described.join("; ") : "(levels not described yet)"
      }`,
    );
  }
  return lines.join("\n");
}

function describeSynthesis(doc: EvaluationQuestion): string {
  const judgement = doc.overallJudgement;
  if (!judgement) return "(no Overall Judgement has been made yet)";
  if ((judgement.freeTextOverride ?? "").trim() !== "") {
    return `Free-text synthesis: ${judgement.freeTextOverride!.trim()}`;
  }
  const nameFor = (id: string) =>
    doc.mesoLayers.flatMap((l) => l.nodes).find((n) => n.id === id)?.name ?? "(unnamed)";
  const columnLabelFor = (id: string) => findColumnInAnyLayer(doc, id)?.label ?? "(column)";
  const below = negativeColumns(judgement.continuum);
  const above = positiveColumns(judgement.continuum);
  const emit = (columnId: string, columnLabel: string): string => {
    const out = [`Conclusion: ${label(columnLabel)}`];
    if (judgement.decisionRowEnabled) {
      const d = judgement.decisionCells.find((c) => c.columnId === columnId)?.text?.trim();
      if (d) out.push(`  Decision: ${d}`);
    }
    const p = judgement.plainDescriptionCells.find((c) => c.columnId === columnId)?.text?.trim();
    out.push(`  Plain description: ${p || "(none yet)"}`);
    for (const s of judgement.scenarios
      .filter((sc) => sc.yieldsColumnId === columnId)
      .sort((a, b) => a.order - b.order)) {
      const text = scenarioPlainText(s.parts, nameFor, columnLabelFor).trim();
      if (text !== "") out.push(`  Condition: ${text}`);
    }
    return out.join("\n");
  };
  const parts = below.map((c) => emit(c.id, c.label));
  if (below.length > 0 && above.length > 0) parts.push(BAR);
  parts.push(...above.map((c) => emit(c.id, c.label)));
  return parts.join("\n");
}

function describeAncestors(
  doc: EvaluationQuestion,
  target: HandoffTarget,
  node: MesoNode | undefined,
): string {
  const kindLabel = kindLabelOf(doc);
  if (target.kind === "mesoNode" && node) {
    const chain = [doc.title || "Evaluation Question"];
    const parent =
      node.parentNodeId !== undefined
        ? superiorLayer(doc)?.nodes.find((n) => n.id === node.parentNodeId)
        : undefined;
    if (parent) chain.push(parent.name || "(unnamed layer above)");
    chain.push(node.name || "(unnamed)");
    return chain.join(" ▸ ");
  }
  const names = [...(subordinateLayer(doc)?.nodes ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((n) => n.name || "(unnamed)");
  return names.length > 0 ? names.join(", ") : `(no ${kindLabel}s yet)`;
}

function describeMatrix(
  doc: EvaluationQuestion,
  kindLabel: string,
  kindLabelPlural: string,
): string {
  const matrix = evidenceMatrix(doc);
  if (matrix.rows.length === 0) return "(no Evidence / Methods yet)";
  const nameOf = new Map(matrix.columns.map((c) => [c.nodeId, c.name || "(unnamed)"]));
  const lines = matrix.rows.map((row) => {
    const against = row.markedNodeIds.map((id) => nameOf.get(id) ?? "(unnamed)");
    return `- ${row.label}: ${
      against.length > 0 ? against.join(", ") : `(not marked against any ${kindLabel})`
    }`;
  });
  const covered = new Set(matrix.rows.flatMap((r) => r.markedNodeIds));
  const uncovered = matrix.columns.filter((c) => !covered.has(c.nodeId));
  if (uncovered.length > 0) {
    lines.push(
      `- ${cap(kindLabelPlural)} with no Evidence / Method yet: ${uncovered
        .map((c) => c.name || "(unnamed)")
        .join(", ")}`,
    );
  }
  return [
    `Evidence / Method → the ${kindLabelPlural} it is marked against:`,
    ...lines,
  ].join("\n");
}

// ---- Glossary (one line each, per screen — AI-HANDOFF.md §2, ⚠Q57 (c)) -------

const GLOSSARY: Record<AiAppliesTo, string[]> = {
  evaluationQuestion: [
    "Merit — the quality being judged (never worth / value / significance).",
    "Value-language — the words in the question that express merit.",
    "Evidence Matrix — Evidence / Methods set against the criteria or components.",
  ],
  continuum: [
    "Continuum — the ordered scale of Column Headers for a rubric.",
    "Column Header — the user-authored label of one column (a conclusion).",
    "Sufficient Bar — the line between not-yet-sufficient and sufficient.",
  ],
  mesoNode: [
    "Criterion / Component — one row of the rubric being described.",
    "Plain Description — what each conclusion looks like, in plain words.",
    "Reach — which conclusions a criterion can be rated at (open vs greyed).",
  ],
  overallJudgement: [
    "Overall Judgement — the top-tier conclusion synthesised from the meso layer(s).",
    "Conclusion — one degree (column) of a rubric.",
    "Decision row — the macro-level decision published in the synthesis rubric.",
  ],
};

function glossaryFor(kind: AiAppliesTo): string {
  return GLOSSARY[kind].map((t) => `- ${t}`).join("\n");
}

function cap(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}
