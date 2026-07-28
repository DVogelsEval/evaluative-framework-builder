import { useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import {
  checkCellContent,
  checkPlainDescriptionsComplete,
} from "../domain/invariants";
import type { Column, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";
import { WizardNav } from "./WizardNav";

/**
 * J6: the full-rubric review — every node row at once over the shared
 * continuum (R-065). Clicking a row opens the J5 editor on that node (R-066,
 * GWT-6.1); the rubric stays revisable later (R-067, GWT-6.2). Confirming
 * marks the criterion-rubric stage complete and moves on to evidence.
 */
export function ReviewView() {
  const doc = useStore((s) => s.doc);
  const openNodeEditor = useStore((s) => s.openNodeEditor);
  const confirmRubricReview = useStore((s) => s.confirmRubricReview);
  const setView = useStore((s) => s.setView);
  const [gateMessages, setGateMessages] = useState<string[]>([]);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const negatives = negativeColumns(layer.continuum);
  const positives = positiveColumns(layer.continuum);

  const barCol = 2 + negatives.length;
  const gridTemplateColumns = `minmax(8rem, 12rem) repeat(${negatives.length}, minmax(8rem, 1fr)) 12px repeat(${positives.length}, minmax(8rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 2 : barCol + 1 + i;

  const reviewCell = (node: MesoNode, column: Column, gridColumn: number, gridRow: number) => {
    const cell = node.cells.find((c) => c.columnId === column.id);
    return (
      <div
        key={column.id}
        className={cell?.included ? "review-cell" : "review-cell cell-excluded"}
        style={{ gridColumn, gridRow }}
      >
        {cell?.included ? cell.plainDescription : ""}
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Review the full rubric</h2>
      <p data-testid="review-note">
        Every {nodeLabel} row over the shared continuum. Click a row to edit it — and
        you can keep updating this rubric later as your thinking develops; move on when
        you are satisfied for now.
      </p>

      <div
        className="continuum-grid review-grid"
        data-testid="review-grid"
        style={{ gridTemplateColumns }}
      >
        <div className="col-header" style={{ gridColumn: 1, gridRow: 1 }} />
        {negatives.map((c, i) => (
          <div key={c.id} className="col-header col-negative" style={{ gridColumn: columnFor("negative", i), gridRow: 1 }}>
            {c.label}
          </div>
        ))}
        <div
          className="sufficient-bar"
          title="Sufficient Bar"
          style={{ gridColumn: barCol, gridRow: `1 / ${layer.nodes.length + 2}` }}
        />
        {positives.map((c, i) => (
          <div key={c.id} className="col-header col-positive" style={{ gridColumn: columnFor("positive", i), gridRow: 1 }}>
            {c.label}
          </div>
        ))}

        {layer.nodes.map((node, row) => (
          <div key={node.id} style={{ display: "contents" }}>
            <button
              type="button"
              className="review-row-label"
              data-testid={`review-row-${node.order}`}
              title={`Edit "${node.name}"`}
              style={{ gridColumn: 1, gridRow: row + 2 }}
              onClick={() => openNodeEditor(node.id)}
            >
              {node.name}
            </button>
            {negatives.map((c, i) => reviewCell(node, c, columnFor("negative", i), row + 2))}
            {positives.map((c, i) => reviewCell(node, c, columnFor("positive", i), row + 2))}
          </div>
        ))}
      </div>

      <WizardNav
        continueTestId="review-continue"
        continueLabel="Looks right — continue to evidence"
        onContinue={() => {
          // Advancing is allowed only while J5 completeness still holds (J6).
          const gates = layer.nodes.flatMap((n) => [
            ...checkCellContent(n),
            ...checkPlainDescriptionsComplete(n),
          ]);
          setGateMessages(gates.map((g) => g.message));
          if (gates.length === 0) {
            confirmRubricReview();
            setView("evidence");
          }
        }}
      />
      {gateMessages.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}
    </section>
  );
}
