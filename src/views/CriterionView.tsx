import { useEffect, useRef, useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import {
  checkCellContent,
  checkPlainDescriptionsComplete,
} from "../domain/invariants";
import { canExcludeCell } from "../domain/meso";
import type { Column, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";
import { WizardNav } from "./WizardNav";

/**
 * J5, the plain-description core step: one node at a time as a rubric row
 * (R-056), scrollable up/down between nodes (R-061, GWT-5.4). Reach shows as
 * open vs greyed cells (R-057) with a corner tick box per cell (R-058) and an
 * explanatory note (R-059). A traffic-light panel tracks completeness without
 * covering the cells (R-063); Continue gates on every open cell having a
 * Plain Description (R-062). Degrees are "conclusions", never "judgement"
 * (R-064).
 */

type Light = "green" | "amber" | "red";

function nodeLight(node: MesoNode): Light {
  const open = node.cells.filter((c) => c.included);
  const described = open.filter((c) => (c.plainDescription ?? "").trim() !== "");
  if (described.length === open.length && open.length > 0) return "green";
  return described.length > 0 ? "amber" : "red";
}

export function CriterionView() {
  const doc = useStore((s) => s.doc);
  const setCellPlainDescription = useStore((s) => s.setCellPlainDescription);
  const toggleCellIncluded = useStore((s) => s.toggleCellIncluded);
  const setView = useStore((s) => s.setView);
  const [gateMessages, setGateMessages] = useState<string[]>([]);
  const [index, setIndex] = useState(() => {
    // Review/Home row clicks open the editor on a specific node (R-066).
    const layer = useStore.getState().doc?.mesoLayers.find((l) => l.tierOrder === 0);
    const at = layer?.nodes.findIndex((n) => n.id === useStore.getState().focusNodeId) ?? -1;
    return at >= 0 ? at : 0;
  });
  const lastWheel = useRef(0);

  useEffect(() => {
    useStore.setState({ focusNodeId: null });
  }, []);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer || layer.nodes.length === 0) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const nodes = layer.nodes;
  const node = nodes[Math.min(index, nodes.length - 1)]!;
  const negatives = negativeColumns(layer.continuum);
  const positives = positiveColumns(layer.continuum);
  const cellByColumn = new Map(node.cells.map((c) => [c.columnId, c]));

  const goTo = (next: number) => {
    if (next >= 0 && next < nodes.length) setIndex(next);
  };

  // Scrolling over the row moves between nodes, one at a time (R-061).
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheel.current < 400 || Math.abs(e.deltaY) < 10) return;
    lastWheel.current = now;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
  };

  const barCol = negatives.length + 1;
  const gridTemplateColumns = `repeat(${negatives.length}, minmax(9rem, 1fr)) 12px repeat(${positives.length}, minmax(9rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 1 : barCol + 1 + i;

  const cellAt = (column: Column, side: "negative" | "positive", gridColumn: number) => {
    const cell = cellByColumn.get(column.id);
    if (!cell) return null;
    const locked = cell.included && !canExcludeCell(node, layer.continuum, column.id);
    return (
      <div
        key={column.id}
        className={cell.included ? "rubric-cell" : "rubric-cell cell-excluded"}
        style={{ gridColumn, gridRow: 2 }}
      >
        <label className="cell-tick" title={locked ? `Keep at least one open conclusion ${side === "negative" ? "below" : "above"} the bar` : "Include or exclude this conclusion"}>
          <input
            type="checkbox"
            data-testid={`cell-toggle-${column.ordinal}`}
            checked={cell.included}
            disabled={locked}
            onChange={() => toggleCellIncluded(node.id, cell.id)}
          />
        </label>
        <textarea
          data-testid={`cell-description-${column.ordinal}`}
          rows={4}
          disabled={!cell.included}
          placeholder={cell.included ? "Plain Description" : "Excluded"}
          value={cell.plainDescription ?? ""}
          onChange={(e) => setCellPlainDescription(node.id, cell.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Describe each conclusion</h2>
      <p>
        One {nodeLabel} at a time: write a <strong>Plain Description</strong> of what it
        looks like at each open conclusion — don't worry about evidence yet.
      </p>
      <p className="hint" data-testid="tick-note">
        The tick box in each cell's corner includes or excludes that conclusion for this{" "}
        {nodeLabel}. Unticked cells grey out and their text is withheld; each side of the
        Sufficient Bar keeps at least one open cell.
      </p>

      <div className="criterion-editor">
        <div className="criterion-main" onWheel={onWheel}>
          <div className="row-nav">
            <button
              type="button"
              data-testid="criterion-prev"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            >
              ↑ Previous
            </button>
            <span data-testid="criterion-position">
              {nodeLabel} {index + 1} of {nodes.length}
            </span>
            <button
              type="button"
              data-testid="criterion-next"
              disabled={index === nodes.length - 1}
              onClick={() => goTo(index + 1)}
            >
              ↓ Next
            </button>
          </div>

          <h3 data-testid="criterion-title">{node.name}</h3>
          <div className="continuum-grid rubric-row-grid" style={{ gridTemplateColumns }}>
            {negatives.map((c, i) => (
              <div key={c.id} className="col-header col-negative" style={{ gridColumn: columnFor("negative", i), gridRow: 1 }}>
                {c.label}
              </div>
            ))}
            <div
              className="sufficient-bar"
              data-testid="sufficient-bar"
              title="Sufficient Bar"
              style={{ gridColumn: barCol, gridRow: "1 / 3" }}
            />
            {positives.map((c, i) => (
              <div key={c.id} className="col-header col-positive" style={{ gridColumn: columnFor("positive", i), gridRow: 1 }}>
                {c.label}
              </div>
            ))}
            {negatives.map((c, i) => cellAt(c, "negative", columnFor("negative", i)))}
            {positives.map((c, i) => cellAt(c, "positive", columnFor("positive", i)))}
          </div>

          <WizardNav
            continueTestId="criterion-continue"
            onContinue={() => {
              const gates = nodes.flatMap((n) => [
                ...checkCellContent(n),
                ...checkPlainDescriptionsComplete(n),
              ]);
              setGateMessages(gates.map((g) => g.message));
              if (gates.length === 0) setView("review");
            }}
          />
          {gateMessages.map((message) => (
            <p role="alert" className="error" key={message}>
              {message}
            </p>
          ))}
        </div>

        {/* Traffic lights sit beside the row so they never cover cells (R-063). */}
        <aside className="traffic-panel" data-testid="traffic-panel">
          <h4>Progress</h4>
          {nodes.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={i === index ? "traffic-item current" : "traffic-item"}
              data-testid={`traffic-${n.order}`}
              onClick={() => goTo(i)}
            >
              <span className={`light light-${nodeLight(n)}`} aria-hidden="true" />
              <span className="traffic-name">{n.name || `(unnamed ${nodeLabel})`}</span>
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}
