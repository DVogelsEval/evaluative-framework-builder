import { scenarioDescribed } from "./scenario";
import type {
  Continuum,
  EvaluationQuestion,
  EvidenceMethod,
  MesoLayer,
  MesoNode,
} from "./schema";

/**
 * SPEC §8 invariants — Slice-0 subset.
 *
 * Two enforcement modes (R-150):
 *  - [gate]   a hard block in the linear-forward process (step completion);
 *  - [report] a readiness-report warning that never blocks work.
 *
 * These functions only *detect*; the wizard decides where each gate applies.
 */

export type InvariantMode = "gate" | "report";

export interface InvariantIssue {
  invariant: number; // SPEC §8 number
  mode: InvariantMode;
  message: string;
}

const gate = (invariant: number, message: string): InvariantIssue => ({
  invariant,
  mode: "gate",
  message,
});
const report = (invariant: number, message: string): InvariantIssue => ({
  invariant,
  mode: "report",
  message,
});

/** Invariant 3 [gate] + 4 [report]: ≥1 column each side of the bar; ordinals unique. */
export function checkContinuum(continuum: Continuum): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const ordinals = continuum.columns.map((c) => c.ordinal);
  const negatives = ordinals.filter((o) => o <= continuum.sufficientBarAfterOrdinal);
  const positives = ordinals.filter((o) => o > continuum.sufficientBarAfterOrdinal);
  if (negatives.length < 1 || positives.length < 1) {
    issues.push(
      gate(3, "The continuum needs at least one column on each side of the Sufficient Bar."),
    );
  }
  if (new Set(ordinals).size !== ordinals.length) {
    issues.push(report(4, "Column ordinals must be unique within the continuum."));
  }
  return issues;
}

/** R-042 (header completeness, gates the continuum step from Slice 1 on). */
export function checkColumnHeaders(continuum: Continuum): InvariantIssue[] {
  return continuum.columns.some((c) => c.label.trim() === "")
    ? [gate(3, "Every Column Header needs text before you can continue.")]
    : [];
}

/**
 * R-026 step gate for the node-list step (J4): ≥1 node, every node named
 * (R-153). The three link fields are encouraged, not gated (⚠Q35 provisional).
 * Numbered 5 as it guards the same node-row shape territory as Invariant 5.
 */
export function checkNodeList(layer: MesoLayer): InvariantIssue[] {
  const label = layer.kind === "criteria" ? "criterion" : "component";
  if (layer.nodes.length === 0) {
    return [gate(5, `Add at least one ${label} before continuing.`)];
  }
  return layer.nodes.some((n) => n.name.trim() === "")
    ? [gate(5, `Every ${label} needs a name before you can continue.`)]
    : [];
}

/** Invariant 5 [gate]: exactly one cell per column, no opt-out row. */
export function checkNodeCells(node: MesoNode, continuum: Continuum): InvariantIssue[] {
  const columnIds = continuum.columns.map((c) => c.id);
  const cellColumnIds = node.cells.map((c) => c.columnId);
  const matches =
    columnIds.length === cellColumnIds.length &&
    columnIds.every((id) => cellColumnIds.includes(id));
  return matches
    ? []
    : [gate(5, `"${node.name}" must have exactly one cell per column of the continuum.`)];
}

/** Invariant 6 [gate]: excluded cells carry no content. */
export function checkCellContent(node: MesoNode): InvariantIssue[] {
  return node.cells.some(
    (cell) =>
      !cell.included &&
      ((cell.plainDescription ?? "").trim() !== "" || cell.scenarios.length > 0),
  )
    ? [gate(6, `"${node.name}" has an excluded (greyed-out) cell that still carries content.`)]
    : [];
}

/** Invariant 7 [gate]: every included cell has a non-empty Plain Description. */
export function checkPlainDescriptionsComplete(node: MesoNode): InvariantIssue[] {
  return node.cells.some(
    (cell) => cell.included && (cell.plainDescription ?? "").trim() === "",
  )
    ? [
        gate(
          7,
          `"${node.name}" still has an open cell without a Plain Description.`,
        ),
      ]
    : [];
}

/** Invariant 8 [gate]: evidence tier present (rubric XOR list — the schema union
 *  makes "both" unrepresentable) and ≥1 Evidence/Method link. */
export function checkEvidenceTier(node: MesoNode): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  if (node.evidenceTier === undefined) {
    issues.push(
      gate(8, `"${node.name}" needs an evidence tier (a rubric or a Data Description List).`),
    );
  }
  if (node.evidenceLinks.length < 1) {
    issues.push(gate(8, `"${node.name}" needs at least one Evidence / Method attached.`));
  }
  return issues;
}

/**
 * R-077 step gate (Q37, owner-confirmed + follow-up): an evidence-tier
 * description counts as *complete* when — list: every linked Evidence/Method
 * has ≥1 entry of its own (matched by the entry's Evidence/Method) with a
 * non-empty description (R-076); rubric: every Column Header has text and each
 * linked Evidence/Method has at least one non-empty level description (R-075).
 * Invariant 8 (presence) is checked separately by `checkEvidenceTier`.
 */
export function checkEvidenceTierComplete(node: MesoNode): InvariantIssue[] {
  const tier = node.evidenceTier;
  if (!tier) return []; // absence is Invariant 8's finding, not this one's
  if (tier.shape === "list") {
    const undescribed = node.evidenceLinks.filter(
      (link) =>
        !tier.entries.some(
          (entry) =>
            entry.evidenceMethodId === link.evidenceMethodId &&
            entry.description.trim() !== "",
        ),
    );
    return undescribed.length > 0
      ? [
          gate(
            8,
            `"${node.name}"'s Data Description List still has ${undescribed.length} Evidence/Method(s) without a described entry.`,
          ),
        ]
      : [];
  }
  const issues: InvariantIssue[] = [];
  if (tier.continuum.columns.some((c) => c.label.trim() === "")) {
    issues.push(
      gate(8, `"${node.name}"'s evidence rubric needs text in every Column Header.`),
    );
  }
  const undescribed = node.evidenceLinks.filter(
    (link) =>
      !tier.methodLevelCells.some(
        (cell) =>
          cell.evidenceMethodId === link.evidenceMethodId &&
          cell.description.trim() !== "",
      ),
  );
  if (undescribed.length > 0) {
    issues.push(
      gate(
        8,
        `"${node.name}"'s evidence rubric still has ${undescribed.length} Evidence/Method(s) with no level description.`,
      ),
    );
  }
  return issues;
}

/**
 * Invariant 11's predicate — every included Cell carries ≥1 Scenario with
 * non-empty prose — enforced as the J10 step-completion gate (R-097, one of
 * the deliberate hard blocks R-150 names). As a *node state* ("synthesis-
 * ready") Invariant 11 is [report]; the hard stop is the connect step's
 * Continue, which is exactly where the wizard applies this check.
 */
export function checkScenariosComplete(node: MesoNode): InvariantIssue[] {
  const missing = node.cells.filter(
    (cell) => cell.included && !cell.scenarios.some(scenarioDescribed),
  );
  return missing.length > 0
    ? [
        gate(
          11,
          `"${node.name}" still has ${missing.length} open conclusion(s) without a described Scenario in its Evidence row.`,
        ),
      ]
    : [];
}

/**
 * Invariant 12 [gate]: a combined mixed-methods source has ≥2 members, a
 * `mixedMethodsType` and an explanation (R-169–R-171); "Other" carries the
 * user's own strategy name (R-167). A method ticked as *already* mixed
 * (R-165/R-166 — `isMixedMethodsSource` with no member SubMethods) needs only
 * its type. The type lives once on the source, never per member (Q28).
 */
export function checkMixedMethods(method: EvidenceMethod): InvariantIssue[] {
  if (!method.isMixedMethodsSource) return [];
  const issues: InvariantIssue[] = [];
  const combined = method.memberSubMethods !== undefined;
  if (combined && (method.memberSubMethods?.length ?? 0) < 2) {
    issues.push(
      gate(12, `"${method.name}" needs at least two member methods to be mixed-methods.`),
    );
  }
  if (method.mixedMethodsType === undefined) {
    issues.push(gate(12, `"${method.name}" needs a mixed-methods type.`));
  }
  if (
    method.mixedMethodsType === "other" &&
    (method.mixedMethodsCustomName ?? "").trim() === ""
  ) {
    issues.push(gate(12, `"${method.name}" needs a name for its own strategy.`));
  }
  if (combined && (method.mixedMethodsExplanation ?? "").trim() === "") {
    issues.push(
      gate(12, `"${method.name}" needs an explanation of the mixed-methods strategy.`),
    );
  }
  return issues;
}

/**
 * Invariant 13 [report]: each SubMethod is either retained at the evidence
 * tier (its source method still linked to the node) or exists only in the
 * sub-methods space — the stored flag and the node's links must agree (Q27/Q38).
 */
export function checkSubMethodRetention(
  node: MesoNode,
  methods: EvidenceMethod[],
): InvariantIssue[] {
  const linkedIds = new Set(node.evidenceLinks.map((l) => l.evidenceMethodId));
  const issues: InvariantIssue[] = [];
  for (const source of methods) {
    if (!linkedIds.has(source.id)) continue; // this node didn't combine it
    for (const sub of source.memberSubMethods ?? []) {
      if (sub.retainedAtEvidenceTier !== linkedIds.has(sub.sourceMethodId)) {
        issues.push(
          report(
            13,
            `A sub-method of "${source.name}" is marked ${
              sub.retainedAtEvidenceTier ? "retained" : "sub-methods-only"
            } but the evidence tier of "${node.name}" says otherwise.`,
          ),
        );
      }
    }
  }
  return issues;
}

/**
 * The J11 step-completion gate when synthesis was accepted (⚠Q45 provisional,
 * the Q20 "fulfilled" predicate): every synthesis Column Header has text and
 * every column carries a described Final-judgement plain description — OR the
 * whole-synthesis free text (R-112) is non-empty, replacing the guided
 * process. Criterion-condition scenarios and the Decision row are encouraged,
 * never gated. Absence of the OverallJudgement itself is not this check's
 * finding (Invariant 15 — synthesis is optional, R-098).
 */
export function checkSynthesisComplete(doc: EvaluationQuestion): InvariantIssue[] {
  const judgement = doc.overallJudgement;
  if (!judgement) return [];
  if ((judgement.freeTextOverride ?? "").trim() !== "") return [];
  const issues: InvariantIssue[] = [];
  if (judgement.continuum.columns.some((c) => c.label.trim() === "")) {
    issues.push(
      gate(16, "Every synthesis Column Header needs text before you can continue."),
    );
  }
  const undescribed = judgement.continuum.columns.filter(
    (column) =>
      (
        judgement.plainDescriptionCells.find((c) => c.columnId === column.id)?.text ?? ""
      ).trim() === "",
  );
  if (undescribed.length > 0) {
    issues.push(
      gate(
        16,
        `${undescribed.length} synthesis column(s) still need a Final-judgement plain description (or write the whole synthesis as free text instead).`,
      ),
    );
  }
  return issues;
}

/**
 * Invariant 18 [gate]: at most two meso layers; evidence attaches only to the
 * subordinate layer (`tierOrder === 0`); a superior layer (`tierOrder === 1`)
 * carries no evidence and its children reference it by `parentNodeId`. No third
 * meso layer in v1 (R-046, Q3/Q33).
 */
export function checkMesoLayers(doc: EvaluationQuestion): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  if (doc.mesoLayers.length > 2) {
    issues.push(gate(18, "A framework may have at most two meso layers."));
  }
  const subordinate = doc.mesoLayers.filter((l) => l.tierOrder === 0);
  if (subordinate.length !== 1) {
    issues.push(gate(18, "Exactly one meso layer must be the subordinate (evidence) layer."));
  }
  const superior = doc.mesoLayers.find((l) => l.tierOrder === 1);
  if (superior) {
    const superiorIds = new Set(superior.nodes.map((n) => n.id));
    for (const node of superior.nodes) {
      if (node.evidenceLinks.length > 0 || node.evidenceTier !== undefined) {
        issues.push(
          gate(18, `Superior-layer "${node.name}" must not carry evidence — evidence lives on the subordinate layer.`),
        );
      }
    }
    // Children reference an existing superior node (a dangling parent is a bug).
    for (const layer of doc.mesoLayers) {
      if (layer.tierOrder === 0) {
        for (const node of layer.nodes) {
          if (node.parentNodeId !== undefined && !superiorIds.has(node.parentNodeId)) {
            issues.push(
              gate(18, `"${node.name}" rolls up into a superior node that no longer exists.`),
            );
          }
        }
      }
    }
  }
  return issues;
}

/** Invariant 1 [report]: every id in the document is unique (UUIDs never reused). */
export function checkUniqueIds(doc: EvaluationQuestion): InvariantIssue[] {
  const ids: string[] = [doc.id];
  for (const layer of doc.mesoLayers) {
    ids.push(layer.id, layer.continuum.id);
    ids.push(...layer.continuum.columns.map((c) => c.id));
    for (const node of layer.nodes) {
      ids.push(node.id);
      ids.push(...node.cells.map((c) => c.id));
      ids.push(...node.evidenceLinks.map((l) => l.id));
      if (node.evidenceTier) {
        ids.push(node.evidenceTier.id);
        if (node.evidenceTier.shape === "rubric") {
          ids.push(node.evidenceTier.continuum.id);
          ids.push(...node.evidenceTier.continuum.columns.map((c) => c.id));
        }
      }
    }
  }
  for (const method of doc.evidenceMethods) {
    ids.push(method.id);
    ids.push(...(method.memberSubMethods ?? []).map((s) => s.id));
  }
  if (doc.overallJudgement) {
    ids.push(doc.overallJudgement.id, doc.overallJudgement.continuum.id);
    ids.push(...doc.overallJudgement.continuum.columns.map((c) => c.id));
    ids.push(...doc.overallJudgement.scenarios.map((s) => s.id));
  }
  return new Set(ids).size === ids.length
    ? []
    : [report(1, "Duplicate ids found — UUIDs must be assigned once and never reused.")];
}

/** Whole-document readiness check for the Slice-0 walking skeleton. */
export function checkDocument(doc: EvaluationQuestion): InvariantIssue[] {
  const issues: InvariantIssue[] = [...checkUniqueIds(doc), ...checkMesoLayers(doc)];
  for (const layer of doc.mesoLayers) {
    issues.push(...checkContinuum(layer.continuum));
    for (const node of layer.nodes) {
      issues.push(...checkNodeCells(node, layer.continuum));
      issues.push(...checkCellContent(node));
      issues.push(...checkPlainDescriptionsComplete(node));
      if (layer.tierOrder === 0) {
        issues.push(...checkEvidenceTier(node));
        issues.push(...checkScenariosComplete(node));
        issues.push(...checkSubMethodRetention(node, doc.evidenceMethods));
      }
    }
  }
  for (const method of doc.evidenceMethods) {
    issues.push(...checkMixedMethods(method));
  }
  if (doc.overallJudgement) {
    issues.push(...checkContinuum(doc.overallJudgement.continuum));
    issues.push(...checkSynthesisComplete(doc));
  }
  return issues;
}
