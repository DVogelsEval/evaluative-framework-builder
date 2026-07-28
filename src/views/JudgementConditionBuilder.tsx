import { judgementConclusionElements } from "../domain/conditionLexicon";
import { positiveColumns, negativeColumns } from "../domain/continuum";
import type { EvaluationQuestion, RubricCellCondition } from "../domain/schema";
import { useStore } from "../store/store";
import { ConditionLogicEditor } from "./ConditionLogicEditor";

/**
 * Optional Boolean conditions for the Overall Judgement (Slice 14, owner Q61).
 * Alongside — never replacing — the prose "criterion conditions" scenarios, the
 * user may state *when* each judgement column applies as a click-built Boolean
 * condition over the meso layer's node conclusions (§B.7). These are what the
 * Simulate Judgement window folds up to a simulated Overall Judgement; a column
 * left without one simply isn't reachable by the simulation. Nothing here is
 * executed in the real evaluation flow — conditions are documentation, run only
 * inside the ephemeral sandbox.
 */
export function JudgementConditionBuilder({ doc }: { doc: EvaluationQuestion }) {
  const setJudgementCondition = useStore((s) => s.setJudgementCondition);
  const judgement = doc.overallJudgement;
  if (!judgement) return null;

  const elements = judgementConclusionElements(doc);
  const columns = [
    ...negativeColumns(judgement.continuum),
    ...positiveColumns(judgement.continuum),
  ];
  const conditionFor = (columnId: string): RubricCellCondition | undefined =>
    judgement.conditionCells?.find((c) => c.columnId === columnId)?.condition;

  return (
    <details className="cond-panel syn-cond-panel" data-testid="judgement-condition-panel">
      <summary>
        <strong>Boolean conditions for each judgement level (optional)</strong> — used
        by the Simulate Judgement check
      </summary>
      {elements.length === 0 ? (
        <p className="hint">
          Add {" "}
          {judgement && "meso"} nodes first — a Boolean condition here references your
          criteria/components and their conclusions.
        </p>
      ) : (
        <>
          <p className="hint">
            Say when each Overall-Judgement column applies in terms of your
            criteria/components — e.g. “[Teaching quality] is at or above Sufficient”.
            This is optional and separate from the prose scenarios above; leave it blank
            to keep the prose-only approach.
          </p>
          <div className="cond-cells">
            {columns.map((column) => (
              <div
                key={column.id}
                className="cond-cell"
                data-testid={`judgement-condition-cell-${column.ordinal}`}
              >
                <div className="cond-cell-head">
                  <span className="cond-cell-col">{column.label || "(unnamed)"}</span>
                </div>
                <ConditionLogicEditor
                  elements={elements}
                  condition={conditionFor(column.id)}
                  onChange={(next) => setJudgementCondition(column.id, next)}
                  testId={`judgement-bool-${column.ordinal}`}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
