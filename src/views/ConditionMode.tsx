import { useState } from "react";
import {
  evidenceElementsForNode,
  hasBooleanElements,
  type EvidenceElement,
} from "../domain/conditionLexicon";
import type { EvaluationQuestion, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";

export type ConditionMode = "boolean" | "prose";

/**
 * The page-level Boolean/Prose mode for a node's conditions (R-COND-1/7).
 * Session-local, never persisted; a cell's stored `mode` is its active
 * representation, so switching updates every open cell that already carries a
 * condition without touching the other representation (no data loss).
 *
 * Takes `node`/`doc` as possibly `undefined` so callers can invoke this hook
 * unconditionally before an early return (React's hook-order rule) — see
 * `ConnectView`, which calls it before its `if (!doc || !layer || !node)`
 * guard.
 */
export function useConditionMode(
  node: MesoNode | undefined,
  doc: EvaluationQuestion | null | undefined,
): {
  mode: ConditionMode;
  booleanAvailable: boolean;
  elements: EvidenceElement[];
  chooseMode: (next: ConditionMode) => void;
} {
  const setCellCondition = useStore((s) => s.setCellCondition);
  const [mode, setMode] = useState<ConditionMode>("boolean");
  const booleanAvailable = node && doc ? hasBooleanElements(node, doc) : false;
  const elements = node && doc ? evidenceElementsForNode(node, doc) : [];
  const effectiveMode: ConditionMode = booleanAvailable ? mode : "prose";

  const chooseMode = (next: ConditionMode) => {
    setMode(next);
    if (!node) return;
    for (const cell of node.cells.filter((c) => c.included)) {
      if (cell.condition && cell.condition.mode !== next) {
        setCellCondition(node.id, cell.id, { ...cell.condition, mode: next });
      }
    }
  };

  return { mode: effectiveMode, booleanAvailable, elements, chooseMode };
}

/** The Boolean/Prose two-radio toggle (R-COND-7) — shared by `ConnectView`
 *  (the merged J10 view, Q74) and `SecondLayerView`'s `SuperiorNodeInterlayer`
 *  (the merged interlayer connect pass, Q75), one instance per node. */
export function ConditionModeToggle({
  nodeId,
  mode,
  booleanAvailable,
  onChoose,
}: {
  nodeId: string;
  mode: ConditionMode;
  booleanAvailable: boolean;
  onChoose: (next: ConditionMode) => void;
}) {
  return (
    <fieldset className="cond-mode-toggle" data-testid="condition-mode">
      <legend className="visually-hidden">Specify conditions as</legend>
      <label className={mode === "boolean" ? "chosen" : ""}>
        <input
          type="radio"
          name={`cond-mode-${nodeId}`}
          data-testid="condition-mode-boolean"
          checked={mode === "boolean"}
          disabled={!booleanAvailable}
          onChange={() => onChoose("boolean")}
        />
        Boolean logic
      </label>
      <label className={mode === "prose" ? "chosen" : ""}>
        <input
          type="radio"
          name={`cond-mode-${nodeId}`}
          data-testid="condition-mode-prose"
          checked={mode === "prose"}
          onChange={() => onChoose("prose")}
        />
        Prose description
      </label>
    </fieldset>
  );
}
