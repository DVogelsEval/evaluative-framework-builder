import type { Cell, MesoNode, RubricCellCondition } from "../domain/schema";
import { useStore } from "../store/store";

/**
 * Prose mode (R-COND-5): a freeform text area for when a cell has no lower-layer
 * evidence to reference, or the user prefers plain words. No parsing, no
 * validation. Saved independently of any boolean logic — switching modes never
 * discards the other representation (R-COND-7).
 */
export function ProseEditor({
  node,
  cell,
  testId,
}: {
  node: MesoNode;
  cell: Cell;
  testId?: string;
}) {
  const setCellCondition = useStore((s) => s.setCellCondition);
  const condition = cell.condition;

  const save = (proseDescription: string) => {
    const next: RubricCellCondition = {
      ...(condition ?? { lastModified: new Date().toISOString() }),
      mode: "prose",
      proseDescription: proseDescription === "" ? undefined : proseDescription,
      lastModified: new Date().toISOString(),
    };
    setCellCondition(node.id, cell.id, next);
  };

  return (
    <label className="cond-prose">
      <span className="visually-hidden">When this conclusion applies (freeform)</span>
      <textarea
        rows={3}
        data-testid={testId}
        placeholder="In your own words: when does this conclusion apply?"
        value={condition?.proseDescription ?? ""}
        onChange={(e) => save(e.target.value)}
      />
    </label>
  );
}
