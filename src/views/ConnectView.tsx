import { useEffect, useRef, useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkScenariosComplete } from "../domain/invariants";
import { scenarioDescribed } from "../domain/scenario";
import type { Cell, Column, MesoNode, Scenario } from "../domain/schema";
import { useStore } from "../store/store";
import { firstIncompleteView, scenariosIncomplete } from "../store/wizard";
import { ConditionBuilder } from "./ConditionBuilder";
import { TokenProseEditor, type TokenProseHandle } from "./TokenProseEditor";
import { WizardNav } from "./WizardNav";

/**
 * J10 — connect evidence to conclusions (R-083–R-097). One node at a time:
 * the rubric row with its Plain Descriptions read-only, and beneath it an
 * Evidence row where each open cell collects ≥1 prose Scenario (R-083/R-084).
 * Scenarios are visually separate boxes joined by "OR" — each one independently
 * shows the conclusion has been reached (R-087/R-088). The node's
 * Evidence/Methods sit aside: clicking one inserts its name into the focused
 * scenario's prose as a bold inline token, and the user types what about that
 * method must hold right after it (R-085/R-086, Q41/⚠Q43).
 * A 1–5 Clarity Rating per open cell (endpoints-only labels, Q8) fires the
 * add-evidence prompt at 1–3 (Q9); declining records the "may not be clear"
 * note (R-093–R-096). Continue gates on every node's open cells having a
 * described Scenario (R-097, GWT-10.5).
 */

type Light = "green" | "amber" | "red";

function nodeLight(node: MesoNode): Light {
  const open = node.cells.filter((c) => c.included);
  const done = open.filter((c) => c.scenarios.some(scenarioDescribed));
  if (open.length > 0 && done.length === open.length) return "green";
  return done.length > 0 ? "amber" : "red";
}

export function ConnectView() {
  const doc = useStore((s) => s.doc);
  const addScenario = useStore((s) => s.addScenario);
  const updateScenarioParts = useStore((s) => s.updateScenarioParts);
  const removeScenario = useStore((s) => s.removeScenario);
  const setCellClarity = useStore((s) => s.setCellClarity);
  const setCellClarityNote = useStore((s) => s.setCellClarityNote);
  const beginEvidenceReentry = useStore((s) => s.beginEvidenceReentry);
  const setView = useStore((s) => s.setView);

  const [gateMessages, setGateMessages] = useState<string[]>([]);
  // The scenario that method clicks insert into (set by focusing its prose box).
  const [active, setActive] = useState<{ cellId: string; scenarioId: string } | null>(
    null,
  );
  // The live prose editors, by scenario id — the aside routes insertToken here.
  const editors = useRef(new Map<string, TokenProseHandle>());
  const [index, setIndex] = useState(() => {
    // An evidence re-entry hands back to the node it left (R-095); otherwise
    // open on the first node still missing scenarios.
    const layer = useStore.getState().doc?.mesoLayers.find((l) => l.tierOrder === 0);
    const focused =
      layer?.nodes.findIndex((n) => n.id === useStore.getState().focusNodeId) ?? -1;
    if (focused >= 0) return focused;
    const at = layer?.nodes.findIndex((n) => scenariosIncomplete(n)) ?? -1;
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
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const methodName = (id: string) => methodById.get(id)?.name ?? "(unnamed)";

  const goTo = (next: number) => {
    if (next >= 0 && next < nodes.length) {
      setIndex(next);
      setActive(null);
      setGateMessages([]);
    }
  };

  // Scrolling over the row moves between nodes, one at a time (R-061 pattern).
  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest(".evidence-cell")) return; // let tall cells scroll
    const now = Date.now();
    if (now - lastWheel.current < 400 || Math.abs(e.deltaY) < 10) return;
    lastWheel.current = now;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
  };

  const negatives = negativeColumns(layer.continuum);
  const positives = positiveColumns(layer.continuum);
  const cellByColumn = new Map(node.cells.map((c) => [c.columnId, c]));
  const barCol = 2 + negatives.length;
  const gridTemplateColumns = `minmax(6rem, 7rem) repeat(${negatives.length}, minmax(13rem, 1fr)) 12px repeat(${positives.length}, minmax(13rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 2 : barCol + 1 + i;

  const scenarioBox = (cell: Cell, column: Column, scenario: Scenario, i: number) => (
    <div key={scenario.id} className="scenario-slot">
      {i > 0 && <div className="scenario-or">OR</div>}
      <div
        className={
          active?.scenarioId === scenario.id ? "scenario-box active" : "scenario-box"
        }
      >
        <div className="scenario-box-header">
          <span className="col-side-tag">Scenario {i + 1}</span>
          <button
            type="button"
            className="chip-remove"
            aria-label={`Remove scenario ${i + 1}`}
            title="Remove this scenario (moves to the Recycle Bin)"
            onClick={() => {
              if (active?.scenarioId === scenario.id) setActive(null);
              removeScenario(node.id, cell.id, scenario.id);
            }}
          >
            ×
          </button>
        </div>
        <TokenProseEditor
          ref={(handle) => {
            if (handle) editors.current.set(scenario.id, handle);
            else editors.current.delete(scenario.id);
          }}
          parts={scenario.parts}
          nameFor={methodName}
          onChange={(parts) => updateScenarioParts(node.id, cell.id, scenario.id, parts)}
          onFocus={() => setActive({ cellId: cell.id, scenarioId: scenario.id })}
          placeholder="In your own words: the evidence that would show this conclusion has been reached."
          label={`Scenario ${i + 1} for "${column.label}"`}
          testId={`scenario-${column.ordinal}-${i}`}
        />
      </div>
    </div>
  );

  const clarityBlock = (cell: Cell, column: Column) => (
    <div className="clarity-block">
      <fieldset className="clarity-scale">
        <legend>How clearly will this evidence support the conclusion?</legend>
        <div className="clarity-points">
          {[1, 2, 3, 4, 5].map((r) => (
            <label
              key={r}
              className={
                cell.clarityRating === r ? "clarity-point chosen" : "clarity-point"
              }
            >
              <input
                type="radio"
                name={`clarity-${cell.id}`}
                data-testid={`clarity-${column.ordinal}-${r}`}
                checked={cell.clarityRating === r}
                onChange={() => setCellClarity(node.id, cell.id, r)}
              />
              {r === 1 ? "1 · not clear" : r === 5 ? "5 · very clear" : String(r)}
            </label>
          ))}
        </div>
      </fieldset>
      {cell.clarityRating !== undefined &&
        cell.clarityRating <= 3 &&
        cell.clarityNote === undefined && (
          <div className="clarity-prompt" data-testid={`clarity-prompt-${column.ordinal}`}>
            <p>
              A rating of {cell.clarityRating} suggests the evidence may not clearly
              support this conclusion. Add more evidence for this {nodeLabel}?
            </p>
            <button
              type="button"
              data-testid={`clarity-add-evidence-${column.ordinal}`}
              onClick={() => beginEvidenceReentry(node.id)}
            >
              Yes — back to evidence planning
            </button>
            <button
              type="button"
              className="secondary"
              data-testid={`clarity-decline-${column.ordinal}`}
              onClick={() =>
                setCellClarityNote(
                  node.id,
                  cell.id,
                  "Evidence may not provide confident clarity for this conclusion.",
                )
              }
            >
              No — record a note and move on
            </button>
          </div>
        )}
      {cell.clarityNote !== undefined && (
        <label className="clarity-note">
          Clarity note (kept with this cell for the readiness report)
          <textarea
            rows={2}
            data-testid={`clarity-note-${column.ordinal}`}
            value={cell.clarityNote}
            onChange={(e) => setCellClarityNote(node.id, cell.id, e.target.value)}
          />
        </label>
      )}
    </div>
  );

  const plainCell = (column: Column, side: "negative" | "positive", i: number) => {
    const cell = cellByColumn.get(column.id);
    if (!cell) return null;
    return (
      <div
        key={column.id}
        className={cell.included ? "review-cell" : "review-cell cell-excluded"}
        style={{ gridColumn: columnFor(side, i), gridRow: 2 }}
      >
        {cell.included ? cell.plainDescription : ""}
      </div>
    );
  };

  const evidenceCell = (column: Column, side: "negative" | "positive", i: number) => {
    const cell = cellByColumn.get(column.id);
    if (!cell) return null;
    if (!cell.included) {
      return (
        <div
          key={column.id}
          className="review-cell cell-excluded"
          style={{ gridColumn: columnFor(side, i), gridRow: 3 }}
        />
      );
    }
    return (
      <div
        key={column.id}
        className="evidence-cell"
        data-testid={`evidence-cell-${column.ordinal}`}
        style={{ gridColumn: columnFor(side, i), gridRow: 3 }}
      >
        {cell.scenarios.map((s, si) => scenarioBox(cell, column, s, si))}
        <button
          type="button"
          className="secondary"
          data-testid={`add-scenario-${column.ordinal}`}
          onClick={() => addScenario(node.id, cell.id)}
        >
          + Add scenario
        </button>
        {cell.scenarios.length > 0 && clarityBlock(cell, column)}
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Connect the evidence to “{node.name}”</h2>
      <p>
        For each open conclusion, describe ≥1 <strong>Scenario</strong> — the evidence
        that would show it has been reached. Click an Evidence/Method in the side panel
        to drop its <strong>name</strong> into your prose, then write what about that
        method must happen. Boxes joined by <em>OR</em> are independent alternatives:
        any one of them is enough on its own.
      </p>

      <div className="criterion-editor">
        <div className="criterion-main" onWheel={onWheel}>
          <div className="row-nav">
            <button
              type="button"
              data-testid="connect-prev"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            >
              ↑ Previous
            </button>
            <span data-testid="connect-position">
              {nodeLabel} {index + 1} of {nodes.length}
            </span>
            <button
              type="button"
              data-testid="connect-next"
              disabled={index === nodes.length - 1}
              onClick={() => goTo(index + 1)}
            >
              ↓ Next
            </button>
          </div>

          <div
            className="continuum-grid review-grid connect-grid"
            style={{ gridTemplateColumns }}
          >
            <div style={{ gridColumn: 1, gridRow: 1 }} />
            {negatives.map((c, i) => (
              <div
                key={c.id}
                className="col-header col-negative"
                style={{ gridColumn: columnFor("negative", i), gridRow: 1 }}
              >
                {c.label}
              </div>
            ))}
            <div
              className="sufficient-bar"
              data-testid="sufficient-bar"
              title="Sufficient Bar"
              style={{ gridColumn: barCol, gridRow: "1 / 4" }}
            />
            {positives.map((c, i) => (
              <div
                key={c.id}
                className="col-header col-positive"
                style={{ gridColumn: columnFor("positive", i), gridRow: 1 }}
              >
                {c.label}
              </div>
            ))}
            <div className="connect-row-label" style={{ gridColumn: 1, gridRow: 2 }}>
              Plain Description
            </div>
            {negatives.map((c, i) => plainCell(c, "negative", i))}
            {positives.map((c, i) => plainCell(c, "positive", i))}
            <div className="connect-row-label" style={{ gridColumn: 1, gridRow: 3 }}>
              Evidence
            </div>
            {negatives.map((c, i) => evidenceCell(c, "negative", i))}
            {positives.map((c, i) => evidenceCell(c, "positive", i))}
          </div>

          {/* Slice 13: click-built plain-English conditions stating *when* each
              conclusion applies — documentation for the logic, never executed. */}
          <ConditionBuilder node={node} doc={doc} />

          <WizardNav
            continueTestId="connect-continue"
            onContinue={() => {
              const gates = nodes.flatMap((n) => checkScenariosComplete(n));
              setGateMessages(gates.map((g) => g.message));
              if (gates.length === 0) setView(firstIncompleteView(doc));
            }}
          />
          {gateMessages.map((message) => (
            <p role="alert" className="error" key={message}>
              {message}
            </p>
          ))}
        </div>

        {/* Two separate shapes — the click-to-reference methods and the
            progress list read as distinct panels (2026-07-14 notes). */}
        <div className="side-column">
          <aside className="traffic-panel methods-panel" data-testid="methods-panel">
            <h4>Evidence / Methods</h4>
            <p className="hint">
              {active
                ? "Click a method: its name lands in the highlighted scenario, and you write what about it must hold."
                : "Click into a scenario, then click a method to put its name in your prose."}
            </p>
            {node.evidenceLinks.map((link) => {
              const method = methodById.get(link.evidenceMethodId);
              if (!method) return null;
              return (
                <div key={link.id}>
                  <button
                    type="button"
                    className="traffic-item"
                    data-testid={`ref-method-${method.name}`}
                    disabled={!active}
                    // Keep the caret in the scenario prose while clicking here.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      active &&
                      editors.current.get(active.scenarioId)?.insertToken(method.id)
                    }
                  >
                    <span className="traffic-name">
                      {method.name}
                      {method.isMixedMethodsSource ? " (mixed)" : ""}
                    </span>
                  </button>
                  {method.memberSubMethods?.map((sub) => (
                    <p key={sub.id} className="sub-method-line">
                      ↳ {methodById.get(sub.sourceMethodId)?.name ?? "(unnamed)"}
                      {sub.retainedAtEvidenceTier ? "" : " (sub-methods only)"}
                    </p>
                  ))}
                </div>
              );
            })}
          </aside>
          <aside className="traffic-panel" data-testid="connect-progress">
            <h4>Progress</h4>
            {nodes.map((n, i) => (
              <button
                key={n.id}
                type="button"
                className={i === index ? "traffic-item current" : "traffic-item"}
                data-testid={`connect-traffic-${n.order}`}
                onClick={() => goTo(i)}
              >
                <span className={`light light-${nodeLight(n)}`} aria-hidden="true" />
                <span className="traffic-name">{n.name}</span>
              </button>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}
