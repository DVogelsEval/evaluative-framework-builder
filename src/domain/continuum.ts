import type { Column, Continuum, ValueSpan } from "./schema";

/**
 * Pure continuum helpers for Slice 1 (J2). The continuum is a bipolar scale:
 * a negative (left) and positive (right) side around a Sufficient Bar, with
 * ≥1 column each side (R-036–R-041, R-158/Q7). Positive/negative is *derived*
 * from `sufficientBarAfterOrdinal`, never stored (R-039).
 *
 * These functions only compute; the store applies the result. Keeping ordinals
 * contiguous (1..N) with the bar sitting after the negative count means the
 * schema stays consistent with Invariants 3 & 4 by construction.
 */

const newId = (): string => crypto.randomUUID();

export type ContinuumSide = "negative" | "positive";

/** Columns sorted left→right by ordinal (R-040). */
export function orderedColumns(continuum: Continuum): Column[] {
  return [...continuum.columns].sort((a, b) => a.ordinal - b.ordinal);
}

/** Columns at or below the bar — the "negative" side (R-039). */
export function negativeColumns(continuum: Continuum): Column[] {
  return orderedColumns(continuum).filter(
    (c) => c.ordinal <= continuum.sufficientBarAfterOrdinal,
  );
}

/** Columns above the bar — the "positive" side (R-039). */
export function positiveColumns(continuum: Continuum): Column[] {
  return orderedColumns(continuum).filter(
    (c) => c.ordinal > continuum.sufficientBarAfterOrdinal,
  );
}

/** Which side of the Sufficient Bar a column sits on, or undefined if unknown. */
export function sideOf(continuum: Continuum, columnId: string): ContinuumSide | undefined {
  const column = continuum.columns.find((c) => c.id === columnId);
  if (!column) return undefined;
  return column.ordinal <= continuum.sufficientBarAfterOrdinal ? "negative" : "positive";
}

/**
 * Recompose a continuum from an explicit left→right order: ordinals become
 * 1..N and the bar sits after the negative count. Column objects (and their
 * labels/content) are preserved — only `ordinal` and the bar are recomputed.
 */
function recompose(
  negatives: Column[],
  positives: Column[],
): Pick<Continuum, "columns" | "sufficientBarAfterOrdinal"> {
  const columns = [...negatives, ...positives].map((c, i) => ({ ...c, ordinal: i + 1 }));
  return { columns, sufficientBarAfterOrdinal: negatives.length };
}

/**
 * Add a column at the *outer* edge of a side (the new extreme), leaving the
 * bar-adjacent core columns and their content undisturbed. Sides need not be
 * equal (R-040/R-041). Returns a new Continuum; the header starts empty for the
 * user to author (R-038).
 */
export function addColumn(continuum: Continuum, side: ContinuumSide): Continuum {
  const fresh: Column = { id: newId(), label: "", ordinal: 0 };
  const negatives = negativeColumns(continuum);
  const positives = positiveColumns(continuum);
  const recomposed =
    side === "negative"
      ? recompose([fresh, ...negatives], positives) // far left = most negative
      : recompose(negatives, [...positives, fresh]); // far right = most positive
  return { ...continuum, ...recomposed };
}

export interface RemoveColumnResult {
  continuum: Continuum;
  removed: boolean;
  message?: string;
}

/**
 * Remove a column, refusing to delete the last one on either side so every
 * rubric always keeps ≥1 column just-below and just-above the bar
 * (R-158/Q7, GWT-2.4). On refusal the continuum is returned unchanged.
 */
export function removeColumn(continuum: Continuum, columnId: string): RemoveColumnResult {
  const side = sideOf(continuum, columnId);
  if (!side) return { continuum, removed: false, message: "Unknown column." };

  const negatives = negativeColumns(continuum);
  const positives = positiveColumns(continuum);
  const sideCount = side === "negative" ? negatives.length : positives.length;
  if (sideCount <= 1) {
    return {
      continuum,
      removed: false,
      message: `Every continuum needs at least one column on the ${side} side of the Sufficient Bar.`,
    };
  }

  const recomposed = recompose(
    negatives.filter((c) => c.id !== columnId),
    positives.filter((c) => c.id !== columnId),
  );
  return { continuum: { ...continuum, ...recomposed }, removed: true };
}

/**
 * Seed empty positive-side headers from highlighted value-language, in order
 * from the Sufficient Bar outward — value language expresses merit, so it seeds
 * the right of the bar (R-035, GWT-2.2). Only *blank* headers are filled, so
 * seeding never clobbers user-authored text and the user edits freely afterward
 * (R-038). Decision recorded as Q34 in docs/OPEN-QUESTIONS.md.
 */
export function seedHeadersFromValueLanguage(
  continuum: Continuum,
  spans: ValueSpan[],
): Continuum {
  const seeds = spans.map((s) => s.text.trim()).filter((t) => t !== "");
  if (seeds.length === 0) return continuum;

  const assignment = new Map<string, string>();
  let next = 0;
  for (const column of positiveColumns(continuum)) {
    if (next >= seeds.length) break;
    if (column.label.trim() === "") assignment.set(column.id, seeds[next++]!);
  }
  if (assignment.size === 0) return continuum;

  const columns = continuum.columns.map((c) =>
    assignment.has(c.id) ? { ...c, label: assignment.get(c.id)! } : c,
  );
  return { ...continuum, columns };
}
