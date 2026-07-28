import type { EvidenceElement } from "../domain/conditionLexicon";
import type { Cell, MesoNode, RubricCellCondition } from "../domain/schema";
import { useStore } from "../store/store";
import { ConditionLogicEditor } from "./ConditionLogicEditor";

/**
 * The boolean condition builder for one criterion rubric cell (R-COND-2). A thin
 * wrapper over the shared `ConditionLogicEditor`: it supplies the cell's stored
 * condition and saves changes back to the document via `setCellCondition`.
 * Saving always succeeds even with validation errors — errors are informational
 * (R-COND-9). Clearing the last term drops the boolean logic but keeps the cell.
 */
export function BooleanEditor({
  node,
  cell,
  elements,
  testId,
}: {
  node: MesoNode;
  cell: Cell;
  elements: EvidenceElement[];
  testId: string;
}) {
  const setCellCondition = useStore((s) => s.setCellCondition);
  const onChange = (next: RubricCellCondition | null) => {
    setCellCondition(
      node.id,
      cell.id,
      next ?? { mode: "boolean", lastModified: new Date().toISOString() },
    );
  };
  return (
    <ConditionLogicEditor
      elements={elements}
      condition={cell.condition}
      onChange={onChange}
      testId={testId}
    />
  );
}
