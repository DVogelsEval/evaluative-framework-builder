import { COMPARATOR_PHRASE } from "../domain/conditionLexicon";
import type { FlatItem } from "../domain/BooleanParser";

/**
 * One condition term rendered as clickable inline tokens (R-COND-10): the
 * evidence element (blue), comparator (gray) and value (teal). Clicking any
 * part opens the term editor; the × deletes the term. Operators between terms
 * are rendered by the parent, not here.
 */
export function ConditionTermToken({
  item,
  index,
  onEdit,
  onDelete,
  testId,
}: {
  item: FlatItem;
  index: number;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  testId?: string;
}) {
  const { term, negated } = item;
  const phrase = COMPARATOR_PHRASE[term.comparator];
  const hasValue = term.value !== null && term.valueLabel !== "";
  return (
    <span className="cond-term" data-testid={testId}>
      {negated && <span className="cond-op">not</span>}
      <button
        type="button"
        className="cond-token-group"
        onClick={() => onEdit(index)}
        title="Edit this term"
        data-testid={testId ? `${testId}-edit` : undefined}
      >
        <span className="cond-tok cond-element">{term.evidenceElementLabel}</span>{" "}
        <span className="cond-tok cond-comparator">{phrase}</span>
        {hasValue && (
          <>
            {" "}
            <span className="cond-tok cond-value">{term.valueLabel}</span>
          </>
        )}
      </button>
      <button
        type="button"
        className="chip-remove"
        aria-label={`Remove term ${index + 1}`}
        title="Remove this term"
        onClick={() => onDelete(index)}
      >
        ×
      </button>
    </span>
  );
}
