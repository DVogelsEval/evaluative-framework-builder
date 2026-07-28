import { useState } from "react";
import {
  evidenceElementsForNode,
  hasBooleanElements,
} from "../domain/conditionLexicon";
import type { EvaluationQuestion, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";
import { BooleanEditor } from "./BooleanEditor";
import { ProseEditor } from "./ProseEditor";

/**
 * The condition builder panel for one node (R-COND-1/7). A page-level toggle
 * chooses Boolean or Prose mode for *all* the node's open conclusions; the mode
 * is session-local and never persisted. Switching modes preserves both stored
 * representations (the boolean tree and the prose text live side by side on the
 * cell), so no data is lost. Boolean mode is offered only when the node has
 * evidence methods to reference; otherwise it is disabled with a message
 * (R-COND-7) and Prose is used.
 */
export function ConditionBuilder({
  node,
  doc,
}: {
  node: MesoNode;
  doc: EvaluationQuestion;
}) {
  const setCellCondition = useStore((s) => s.setCellCondition);
  const booleanAvailable = hasBooleanElements(node, doc);
  const [mode, setMode] = useState<"boolean" | "prose">(
    booleanAvailable ? "boolean" : "prose",
  );
  const effectiveMode = booleanAvailable ? mode : "prose";
  const elements = evidenceElementsForNode(node, doc);

  const layer = doc.mesoLayers.find((l) => l.nodes.some((n) => n.id === node.id));
  const columnOf = (columnId: string) =>
    layer?.continuum.columns.find((c) => c.id === columnId);

  const openCells = node.cells.filter((c) => c.included);
  if (openCells.length === 0) return null;

  // The toggle is session-local (R-COND-7), but a cell's stored `mode` is the
  // *active representation* (R-COND-8) — so switching the toggle updates the
  // mode of every open cell that already carries a condition, without touching
  // the boolean logic or prose it also holds (both are preserved, no data loss).
  const chooseMode = (next: "boolean" | "prose") => {
    setMode(next);
    for (const cell of openCells) {
      if (cell.condition && cell.condition.mode !== next) {
        setCellCondition(node.id, cell.id, { ...cell.condition, mode: next });
      }
    }
  };

  return (
    <section className="cond-panel" data-testid="condition-panel">
      <div className="cond-panel-head">
        <h4>When each conclusion applies (optional)</h4>
        <fieldset className="cond-mode-toggle" data-testid="condition-mode">
          <legend className="visually-hidden">Specify conditions as</legend>
          <label className={effectiveMode === "boolean" ? "chosen" : ""}>
            <input
              type="radio"
              name={`cond-mode-${node.id}`}
              data-testid="condition-mode-boolean"
              checked={effectiveMode === "boolean"}
              disabled={!booleanAvailable}
              onChange={() => chooseMode("boolean")}
            />
            Boolean logic
          </label>
          <label className={effectiveMode === "prose" ? "chosen" : ""}>
            <input
              type="radio"
              name={`cond-mode-${node.id}`}
              data-testid="condition-mode-prose"
              checked={effectiveMode === "prose"}
              onChange={() => chooseMode("prose")}
            />
            Prose description
          </label>
        </fieldset>
      </div>

      {!booleanAvailable && (
        <p className="hint" data-testid="condition-no-boolean">
          Boolean mode needs evidence elements to reference. Add Evidence/Methods to this
          node, or describe the condition in prose.
        </p>
      )}

      <div className="cond-cells">
        {openCells.map((cell) => {
          const column = columnOf(cell.columnId);
          const ord = column?.ordinal ?? 0;
          return (
            <div key={cell.id} className="cond-cell" data-testid={`condition-cell-${ord}`}>
              <div className="cond-cell-head">
                <span className="cond-cell-col">{column?.label || "(unnamed)"}</span>
                <span className="hint">
                  {cell.plainDescription ? `“${cell.plainDescription.slice(0, 60)}”` : ""}
                </span>
              </div>
              {effectiveMode === "boolean" ? (
                <BooleanEditor node={node} cell={cell} elements={elements} testId={`bool-${ord}`} />
              ) : (
                <ProseEditor node={node} cell={cell} testId={`prose-${ord}`} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
