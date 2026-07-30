import { useMemo, useState } from "react";
import {
  COMPARATOR_PHRASE,
  comparatorsForElement,
  valueLabel,
  valuesForTerm,
  type EvidenceElement,
} from "../domain/conditionLexicon";
import type { Comparator, ComparisonValue, ConditionTerm } from "../domain/schema";

export type JoinOp = "AND" | "OR";

/**
 * The term editor modal (R-COND-2): pick an evidence element, then a
 * context-aware comparator (R-COND-4), then a context-aware value. Save returns
 * a built ConditionTerm plus the term's negation and the chain's join word
 * (Q74/D6 — there is one `+ Add condition` button; join/negate live here
 * instead of on separate add-and/add-or/add-not buttons). Delete is offered
 * only when editing an existing term.
 */
export function ConditionModal({
  elements,
  initial,
  showJoin,
  initialJoinOp,
  initialNegated,
  onSave,
  onCancel,
  onDelete,
}: {
  elements: EvidenceElement[];
  initial: ConditionTerm | null;
  showJoin: boolean;
  initialJoinOp: JoinOp;
  initialNegated: boolean;
  onSave: (term: ConditionTerm, opts: { negated: boolean; joinOp: JoinOp }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const initialElement =
    elements.find((e) => e.id === initial?.evidenceElementId) ?? elements[0];
  const [elementId, setElementId] = useState<string>(initialElement?.id ?? "");
  const [comparator, setComparator] = useState<Comparator>(
    initial?.comparator ?? "is",
  );
  const [value, setValue] = useState<ComparisonValue>(initial?.value ?? null);
  const [joinOp, setJoinOp] = useState<JoinOp>(initialJoinOp);
  const [negated, setNegated] = useState(initialNegated);

  const element = elements.find((e) => e.id === elementId) ?? elements[0];
  const comparators = useMemo(
    () => (element ? comparatorsForElement(element) : []),
    [element],
  );
  // Keep the comparator valid for the chosen element.
  const activeComparator = comparators.includes(comparator)
    ? comparator
    : (comparators[0] ?? "is");
  const choices = element ? valuesForTerm(element, activeComparator) : { kind: "none" as const };

  // The value shown must fit the current choices; fall back to a sensible default.
  const activeValue: ComparisonValue = (() => {
    if (choices.kind === "none") return null;
    if (choices.kind === "number") {
      return typeof value === "number" ? value : choices.min;
    }
    if (choices.kind === "columns") {
      const current =
        value !== null && typeof value === "object" && "columnId" in value ? value : null;
      const has = current && choices.options.some((o) => o.columnId === current.columnId);
      return has ? current : (choices.options[0] ? { columnId: choices.options[0].columnId } : null);
    }
    return typeof value === "string" && choices.options.includes(value)
      ? value
      : ((choices.options[0] ?? null) as ComparisonValue);
  })();

  if (!element) return null;

  // The label a saved term stores for its value — a column ref resolves its
  // header from the element's columns (conclusion refs, §B.7); everything else
  // stringifies (`valueLabel`).
  const labelFor = (v: ComparisonValue): string => {
    if (choices.kind === "columns" && v !== null && typeof v === "object" && "columnId" in v) {
      return choices.options.find((o) => o.columnId === v.columnId)?.label ?? "";
    }
    return valueLabel(v);
  };

  const save = () => {
    onSave(
      {
        evidenceElementId: element.id,
        evidenceElementLabel: element.label,
        comparator: activeComparator,
        value: activeValue,
        valueLabel: labelFor(activeValue),
      },
      { negated, joinOp },
    );
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit condition term">
      <div className="modal cond-modal">
        <h3>{initial ? "Edit condition term" : "Add condition term"}</h3>

        {showJoin && (
          <label className="cond-field">
            <span>Joined to the other terms by</span>
            <select
              data-testid="cond-modal-join"
              value={joinOp}
              onChange={(e) => setJoinOp(e.target.value as JoinOp)}
            >
              <option value="AND">and — all of them must hold</option>
              <option value="OR">or — any one of them is enough</option>
            </select>
          </label>
        )}
        {showJoin && (
          <p className="hint">
            Every term in this condition is joined by the same word — changing this changes the
            whole condition.
          </p>
        )}

        <label className="cond-field">
          <span>Evidence element</span>
          <select
            data-testid="cond-modal-element"
            value={elementId}
            onChange={(e) => setElementId(e.target.value)}
          >
            {elements.map((el) => (
              <option key={el.id} value={el.id}>
                {el.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cond-field">
          <span>Comparator</span>
          <select
            data-testid="cond-modal-comparator"
            value={activeComparator}
            onChange={(e) => setComparator(e.target.value as Comparator)}
          >
            {comparators.map((c) => (
              <option key={c} value={c}>
                {COMPARATOR_PHRASE[c]}
              </option>
            ))}
          </select>
        </label>

        {choices.kind !== "none" && (
          <label className="cond-field">
            <span>Value</span>
            {choices.kind === "number" ? (
              <input
                type="number"
                data-testid="cond-modal-value"
                min={choices.min}
                max={choices.kind === "number" ? choices.max : undefined}
                value={typeof activeValue === "number" ? activeValue : choices.min}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            ) : choices.kind === "columns" ? (
              <select
                data-testid="cond-modal-value"
                value={
                  activeValue !== null && typeof activeValue === "object" && "columnId" in activeValue
                    ? activeValue.columnId
                    : ""
                }
                onChange={(e) => setValue({ columnId: e.target.value })}
              >
                {choices.options.map((opt) => (
                  <option key={opt.columnId} value={opt.columnId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                data-testid="cond-modal-value"
                value={typeof activeValue === "string" ? activeValue : ""}
                onChange={(e) => setValue(e.target.value as ComparisonValue)}
              >
                {choices.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <label className="cond-field cond-negate">
          <input
            type="checkbox"
            data-testid="cond-modal-negate"
            checked={negated}
            onChange={(e) => setNegated(e.target.checked)}
          />
          <span>
            not — this must <strong>not</strong> be true
          </span>
        </label>

        <div className="cond-modal-actions">
          <button type="button" data-testid="cond-modal-save" onClick={save}>
            Save
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          {onDelete && (
            <button
              type="button"
              className="secondary danger"
              data-testid="cond-modal-delete"
              onClick={onDelete}
            >
              Delete this term
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
