import { astToFlat } from "../domain/BooleanParser";
import { COMPARATOR_PHRASE } from "../domain/conditionLexicon";
import type { RubricCellCondition } from "../domain/schema";

/**
 * A read-only view of the Boolean condition that fired for a node (R-SIM-6):
 * the same coloured token chain the Slice-13 builder shows, but static — no
 * edit or delete. Used inside the Simulate flow map when the user asks "which
 * condition fired here?". Falls back to the stored plain English for a
 * condition too nested for the flat token model.
 */
export function ConditionFireDisplay({
  condition,
  testId,
}: {
  condition: RubricCellCondition;
  testId?: string;
}) {
  const root = condition.booleanLogic?.root;
  const flat = root ? astToFlat(root) : null;

  if (!flat) {
    return (
      <p className="cond-plain" data-testid={testId}>
        {condition.booleanLogic?.plainEnglish ?? "(no condition)"}
      </p>
    );
  }

  return (
    <div className="cond-chain cond-chain-readonly" data-testid={testId}>
      {flat.items.map((item, i) => {
        const { term, negated } = item;
        const hasValue = term.value !== null && term.valueLabel !== "";
        return (
          <span key={i} className="cond-chain-item">
            {i > 0 && <span className="cond-op cond-op-join">{flat.op.toLowerCase()}</span>}
            <span className="cond-term">
              {negated && <span className="cond-op">not</span>}
              <span className="cond-token-group cond-token-static">
                <span className="cond-tok cond-element">{term.evidenceElementLabel}</span>{" "}
                <span className="cond-tok cond-comparator">{COMPARATOR_PHRASE[term.comparator]}</span>
                {hasValue && (
                  <>
                    {" "}
                    <span className="cond-tok cond-value">{term.valueLabel}</span>
                  </>
                )}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
