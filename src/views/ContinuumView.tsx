import { useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkColumnHeaders, checkContinuum } from "../domain/invariants";
import type { Column } from "../domain/schema";
import { useStore } from "../store/store";
import { WizardNav } from "./WizardNav";

/**
 * J2, step 2: the continuum as a rubric (R-036). A thick coloured Sufficient
 * Bar runs between the negative and positive sides (R-037); columns can be
 * added/removed on either side, counts need not match, and ≥1 each side is
 * enforced (R-040/R-041/R-158). Greyed cells beneath preview the later rubric
 * (R-043). Continue is gated until every header has text (R-042).
 */
export function ContinuumView() {
  const doc = useStore((s) => s.doc);
  const setColumnLabel = useStore((s) => s.setColumnLabel);
  const addColumn = useStore((s) => s.addColumn);
  const removeColumn = useStore((s) => s.removeColumn);
  const setView = useStore((s) => s.setView);
  const [gateMessages, setGateMessages] = useState<string[]>([]);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer) return null;

  const { continuum } = layer;
  const negatives = negativeColumns(continuum);
  const positives = positiveColumns(continuum);

  // Grid: [negatives…] [bar] [positives…] across two rows (headers, preview).
  const barCol = negatives.length + 1;
  const gridTemplateColumns = `repeat(${negatives.length}, minmax(7rem, 1fr)) 12px repeat(${positives.length}, minmax(7rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 1 : barCol + 1 + i;

  const header = (column: Column, side: "negative" | "positive", gridColumn: number) => {
    const canRemove = (side === "negative" ? negatives.length : positives.length) > 1;
    return (
      <div key={column.id} className={`col-header col-${side}`} style={{ gridColumn, gridRow: 1 }}>
        <div className="col-header-top">
          <span className="col-side-tag">
            {side === "negative" ? "below the bar" : "above the bar"}
          </span>
          <button
            type="button"
            className="chip-remove"
            data-testid={`remove-column-${column.ordinal}`}
            disabled={!canRemove}
            title={
              canRemove
                ? "Remove this column"
                : `Keep at least one column ${side === "negative" ? "below" : "above"} the bar`
            }
            aria-label={`Remove column ${column.ordinal}`}
            onClick={() => removeColumn(column.id)}
          >
            ×
          </button>
        </div>
        <input
          data-testid={`column-label-${column.ordinal}`}
          placeholder="Column Header"
          value={column.label}
          onChange={(e) => setColumnLabel(column.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Set up the continuum</h2>
      <p>
        Author a Column Header for each degree. The <strong>Sufficient Bar</strong> divides
        the not-yet-sufficient (negative) side on the left from the sufficient-or-better
        (positive) side on the right. Add or remove columns on either side — they need not
        be equal, but each side keeps at least one.
      </p>

      <div className="continuum-actions">
        <button
          type="button"
          className="secondary"
          data-testid="add-negative-column"
          onClick={() => addColumn("negative")}
        >
          + Add column below the bar
        </button>
        <button
          type="button"
          className="secondary"
          data-testid="add-positive-column"
          onClick={() => addColumn("positive")}
        >
          + Add column above the bar
        </button>
      </div>

      <div className="continuum-grid" data-testid="continuum" style={{ gridTemplateColumns }}>
        {negatives.map((c, i) => header(c, "negative", columnFor("negative", i)))}
        <div
          className="sufficient-bar"
          data-testid="sufficient-bar"
          title="Sufficient Bar"
          style={{ gridColumn: barCol, gridRow: "1 / 3" }}
        />
        {positives.map((c, i) => header(c, "positive", columnFor("positive", i)))}

        {/* Greyed preview of the rubric row that plain descriptions will fill (R-043). */}
        {negatives.map((c, i) => (
          <div
            key={`preview-${c.id}`}
            className="preview-cell"
            data-testid={`preview-cell-${c.ordinal}`}
            aria-hidden="true"
            style={{ gridColumn: columnFor("negative", i), gridRow: 2 }}
          />
        ))}
        {positives.map((c, i) => (
          <div
            key={`preview-${c.id}`}
            className="preview-cell"
            data-testid={`preview-cell-${c.ordinal}`}
            aria-hidden="true"
            style={{ gridColumn: columnFor("positive", i), gridRow: 2 }}
          />
        ))}
      </div>
      <p className="hint">Preview: your Plain Descriptions will fill these cells later.</p>

      <WizardNav
        continueTestId="continuum-continue"
        onContinue={() => {
          const gates = [
            ...checkContinuum(continuum),
            ...checkColumnHeaders(continuum),
          ].filter((i) => i.mode === "gate");
          setGateMessages(gates.map((g) => g.message));
          if (gates.length === 0) setView("structure");
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
