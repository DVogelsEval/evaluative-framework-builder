import { useEffect, useRef, useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkScenariosComplete } from "../domain/invariants";
import { scenarioDescribed } from "../domain/scenario";
import type { Cell, Column, MesoNode, Scenario } from "../domain/schema";
import { useStore } from "../store/store";
import { firstIncompleteView, scenariosIncomplete } from "../store/wizard";
import { BooleanEditor } from "./BooleanEditor";
import { ConditionModeToggle, useConditionMode } from "./ConditionMode";
import { ProseEditor } from "./ProseEditor";
import { TokenProseEditor, type TokenProseHandle } from "./TokenProseEditor";
import { WizardNav } from "./WizardNav";

/**
 * J10 — connect evidence to conclusions (R-083–R-097, Q74). One node at a
 * time, its conclusions stacked in a single vertical view — not the rubric
 * grid and a separate condition panel this used to be (Q74/D1). Each open
 * conclusion block holds, in order: its Column Header, its full read-only
 * Plain Description (authored in J5), its Evidence row (≥1 prose Scenario,
 * R-083/R-084), its Clarity block, and its condition (boolean or prose,
 * R-COND-*). Blocks run below-bar conclusions first, then the Sufficient Bar
 * divider, then above-bar conclusions (Q74/D2) — deliberately differing from
 * OutputsView's vertical printout, which puts above-bar first; do not
 * reconcile the two. An excluded conclusion collapses to its header and a
 * "not in scope" line (Q74/D3). There is no wheel-stepper on this view
 * (Q74/D5, a deliberate deviation from the R-061 wheel pattern used in
 * CriterionView) — node navigation is Prev/Next plus the Progress list only.
 * Scenarios are visually separate boxes joined by "OR" — each one
 * independently shows the conclusion has been reached (R-087/R-088). The
 * node's Evidence/Methods sit aside: clicking one inserts its name into the
 * focused scenario's prose as a bold inline token (R-085/R-086, Q41/⚠Q43). A
 * 1–5 Clarity Rating per open cell (endpoints-only labels, Q8) fires the
 * add-evidence prompt at 1–3 (Q9); declining records the "may not be clear"
 * note (R-093–R-096). Continue gates on every node's open cells having a
 * described Scenario (R-097, GWT-10.5). Conditions are documentation, never
 * executed outside the ephemeral Simulate sandbox.
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

  useEffect(() => {
    useStore.setState({ focusNodeId: null });
  }, []);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  const nodes = layer?.nodes ?? [];
  const node = nodes.length > 0 ? nodes[Math.min(index, nodes.length - 1)] : undefined;
  // Called unconditionally, before the early return below (hook-order rule).
  const cond = useConditionMode(node, doc);

  if (!doc || !layer || !node) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const methodName = (id: string) => methodById.get(id)?.name ?? "(unnamed)";

  const goTo = (next: number) => {
    if (next >= 0 && next < nodes.length) {
      setIndex(next);
      setActive(null);
      setGateMessages([]);
    }
  };

  const below = negativeColumns(layer.continuum);
  const above = positiveColumns(layer.continuum);
  const cellByColumn = new Map(node.cells.map((c) => [c.columnId, c]));

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

  const conclusionBlock = (column: Column) => {
    const cell = cellByColumn.get(column.id);
    if (!cell) return null;

    if (!cell.included) {
      return (
        <div
          key={column.id}
          className="conclusion-block excluded"
          data-testid={`conclusion-${column.ordinal}`}
        >
          <h4 className="conclusion-head">{column.label || "(unnamed)"}</h4>
          <p className="hint">Not in scope for this {nodeLabel}.</p>
        </div>
      );
    }

    const plain = (cell.plainDescription ?? "").trim();

    return (
      <div
        key={column.id}
        className="conclusion-block"
        data-testid={`conclusion-${column.ordinal}`}
      >
        <h4 className="conclusion-head">{column.label || "(unnamed)"}</h4>
        <div className="conclusion-plain" data-testid={`plain-${column.ordinal}`}>
          {plain !== "" ? (
            cell.plainDescription
          ) : (
            <span className="hint">
              No plain description yet — written in the {nodeLabel} step.
            </span>
          )}
        </div>
        <div
          className="evidence-cell"
          data-testid={`evidence-cell-${column.ordinal}`}
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
        </div>
        {cell.scenarios.length > 0 && clarityBlock(cell, column)}
        <div className="conclusion-condition" data-testid={`condition-cell-${column.ordinal}`}>
          <h5>When this conclusion applies (optional)</h5>
          {cond.mode === "boolean" ? (
            <BooleanEditor
              node={node}
              cell={cell}
              elements={cond.elements}
              testId={`bool-${column.ordinal}`}
            />
          ) : (
            <ProseEditor node={node} cell={cell} testId={`prose-${column.ordinal}`} />
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Connect the evidence to “{node.name}”</h2>
      <p>
        For each open conclusion, describe ≥1 <strong>Scenario</strong> — the evidence
        that would show it has been reached. Boxes joined by <em>OR</em> are
        independent alternatives: any one of them is enough on its own. Click an{" "}
        <strong>Evidence / Method</strong> in the side panel to drop its name into the
        focused scenario, then write what about that method must happen. Optionally,
        state <strong>when</strong> that conclusion applies as a condition.
      </p>

      <div className="criterion-editor">
        <div className="criterion-main">
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

          <section className="cond-panel" data-testid="condition-panel">
            <div className="cond-panel-head">
              <h4>Each conclusion for this {nodeLabel}</h4>
              <ConditionModeToggle
                nodeId={node.id}
                mode={cond.mode}
                booleanAvailable={cond.booleanAvailable}
                onChoose={cond.chooseMode}
              />
            </div>

            {!cond.booleanAvailable && (
              <p className="hint" data-testid="condition-no-boolean">
                Boolean mode needs evidence elements to reference. Add Evidence/Methods
                to this node, or describe the condition in prose.
              </p>
            )}

            <div className="connect-stack" data-testid="connect-stack">
              {below.map(conclusionBlock)}
              {below.length > 0 && above.length > 0 && (
                <div
                  className="connect-bar-divider"
                  data-testid="sufficient-bar"
                  title="Sufficient Bar"
                >
                  Sufficient Bar
                </div>
              )}
              {above.map(conclusionBlock)}
            </div>
          </section>

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
