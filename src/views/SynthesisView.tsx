import { useRef, useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkSynthesisComplete } from "../domain/invariants";
import {
  findColumnInAnyLayer,
  hasSecondLayer,
  subordinateLayer,
  synthesisLayer,
} from "../domain/layers";
import type { Column, JudgementScenario, MesoLayer, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";
import { firstIncompleteView, previousWizardView } from "../store/wizard";
import { JudgementConditionBuilder } from "./JudgementConditionBuilder";
import { TokenProseEditor, type TokenProseHandle } from "./TokenProseEditor";
import { WizardNav } from "./WizardNav";

/**
 * J11 — the Overall Judgement synthesis (R-098–R-112). First the choice: the
 * criterion/component level may be a sufficient terminal output (R-098, Q5) —
 * declining exits to the Home Window with outputs exportable (GWT-11.1).
 * Accepting opens a split view: the synthesis rubric in development on the
 * left (R-106) and the meso rubric in full on the right (R-105) — the click
 * panel sits on the same side, with the same colour shape, as J10's methods
 * panel (2026-07-14 notes). Rows: Header · Decision (toggleable) · Final
 * judgement (plain description) · Final judgement (criterion conditions)
 * (Q16, GWT-11.3). Criterion connections reuse the J10 insert-bold-token
 * mechanic: click a node's cell in the meso rubric → "«name» is «Column
 * Header»" lands in the focused criterion-conditions scenario (Q44 redirect)
 * → the requirement is typed in prose (R-107/R-108, Q41). The panel is greyed
 * until a conditions scenario is focused, and focusing any other input clears
 * the target. An operator dropdown [or below · or above · OR · AND] inserts
 * plain prose text (⚠Q47 — a typing aid; no formal grammar, Q10/R-111 stand).
 * Collective "all other"/custom-group parts (R-110) and a whole-synthesis
 * free-text escape hatch (R-112) round it out.
 */

/** The ⚠Q47 operator set — inserted into the prose as plain text. */
const OPERATOR_OPTIONS = ["or below", "or above", "OR", "AND"] as const;
export function SynthesisView() {
  const doc = useStore((s) => s.doc);
  const acceptSynthesis = useStore((s) => s.acceptSynthesis);
  const declineSynthesis = useStore((s) => s.declineSynthesis);
  const setJudgementColumnLabel = useStore((s) => s.setJudgementColumnLabel);
  const addJudgementColumn = useStore((s) => s.addJudgementColumn);
  const removeJudgementColumn = useStore((s) => s.removeJudgementColumn);
  const toggleDecisionRow = useStore((s) => s.toggleDecisionRow);
  const setDecisionCellText = useStore((s) => s.setDecisionCellText);
  const setJudgementPlainDescription = useStore((s) => s.setJudgementPlainDescription);
  const addJudgementScenario = useStore((s) => s.addJudgementScenario);
  const removeJudgementScenario = useStore((s) => s.removeJudgementScenario);
  const updateJudgementScenarioParts = useStore((s) => s.updateJudgementScenarioParts);
  const setSynthesisFreeText = useStore((s) => s.setSynthesisFreeText);
  const setView = useStore((s) => s.setView);

  const [gateMessages, setGateMessages] = useState<string[]>([]);
  const [customGroup, setCustomGroup] = useState("");
  // The scenario that meso-rubric clicks insert into (set by focusing it).
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const editors = useRef(new Map<string, TokenProseHandle>());

  // Synthesis feeds from the superior layer when a second one exists, else the
  // subordinate layer (Q4) — its nodes are what the judgement scenarios cite.
  const layer = doc ? synthesisLayer(doc) : undefined;
  if (!doc || !layer) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const judgement = doc.overallJudgement;
  const prev = previousWizardView("synthesis");

  // ---- The choice (R-098, Q5) -------------------------------------------------
  if (!judgement) {
    return (
      <section className="panel">
        <h2>Make an Overall Judgement?</h2>
        <p>
          You can synthesise the {nodeLabel} conclusions into one final rubric — or
          decide the {nodeLabel} level is sufficient and finish here. Declining still
          leaves everything exportable from the Home Window, and you can come back to
          this later.
        </p>
        <div className="synthesis-choice">
          <button type="button" data-testid="accept-synthesis" onClick={acceptSynthesis}>
            Yes — build the synthesis rubric
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="decline-synthesis"
            onClick={() => {
              declineSynthesis();
              setView("home");
            }}
          >
            No — the {nodeLabel} level is sufficient
          </button>
        </div>
        {!hasSecondLayer(doc) && (
          <button
            type="button"
            className="link-button"
            data-testid="grow-second-layer"
            onClick={() => setView("secondlayer")}
          >
            Or group these {nodeLabel === "criterion" ? "criteria" : "components"} under a
            higher layer first, and judge that instead (R-099)
          </button>
        )}
        <div className="wizard-nav">
          <button
            type="button"
            className="secondary"
            data-testid="wizard-back"
            disabled={!prev}
            title="Return to the previous step"
            onClick={() => prev && setView(prev)}
          >
            ← Back
          </button>
        </div>
      </section>
    );
  }

  // ---- The split view (R-105/R-106) --------------------------------------------
  // A cell click carries both the node and the clicked column, so the token
  // renders "«name» is «Column Header»" (Q44 redirect, 2026-07-14 notes).
  const insertNodeToken = (nodeId: string, columnId: string) => {
    if (activeScenarioId) {
      editors.current.get(activeScenarioId)?.insertToken(nodeId, columnId);
    }
  };
  const insertCollective = (label: string) => {
    if (label.trim() === "") return;
    if (activeScenarioId) {
      editors.current.get(activeScenarioId)?.insertCollective(label.trim());
    }
  };
  // References belong only in criterion-conditions scenarios — focusing any
  // other input clears the insertion target and greys the click panel.
  const clearTarget = () => setActiveScenarioId(null);
  // A token's `atColumnId` may name a column owned by *either* meso layer now
  // that both feed the judgement (Q53 reading point 2) — resolve against the
  // owning layer, not just `synthesisLayer()`'s continuum.
  const mesoColumnLabel = (columnId: string) =>
    findColumnInAnyLayer(doc, columnId)?.label ?? "(removed conclusion)";

  // Both meso layers feed the single judgement when both exist (Q53): the panel
  // shows the superior layer's rubric rows first, then the subordinate layer's,
  // and clicking either inserts "«node» is «header»". A single-layer framework
  // shows only its one layer (unchanged). Superior rows keep the plain
  // `meso-cell-…` testids (the synthesised layer); subordinate rows are
  // `meso-cell-sub-…` so the two grids' cells stay distinct.
  const secondFeedLayer = hasSecondLayer(doc) ? subordinateLayer(doc) : undefined;

  // Clicking any cell of a node's row drops that node's name into the focused
  // scenario (R-108) — the cell shows its Plain Description for reference.
  const mesoCell = (
    node: MesoNode,
    column: Column,
    gridColumn: number,
    gridRow: number,
    testIdPrefix: string,
  ) => {
    const cell = node.cells.find((c) => c.columnId === column.id);
    if (!cell?.included) {
      return (
        <div
          key={column.id}
          className="review-cell cell-excluded"
          style={{ gridColumn, gridRow }}
        />
      );
    }
    return (
      <button
        key={column.id}
        type="button"
        className="review-cell meso-click-cell"
        data-testid={`${testIdPrefix}-${node.order}-${column.ordinal}`}
        title={
          activeScenarioId
            ? `Insert "${node.name} is ${column.label}" into the highlighted scenario`
            : `Click into a ${nodeLabel}-conditions scenario first`
        }
        disabled={!activeScenarioId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => insertNodeToken(node.id, column.id)}
      >
        {cell.plainDescription}
      </button>
    );
  };

  // One meso layer's rubric rendered as a clickable reference grid.
  const renderMesoGrid = (gridLayer: MesoLayer, testIdPrefix: string) => {
    const gNegatives = negativeColumns(gridLayer.continuum);
    const gPositives = positiveColumns(gridLayer.continuum);
    const gBarCol = 2 + gNegatives.length;
    const gColumnFor = (side: "negative" | "positive", i: number) =>
      side === "negative" ? i + 2 : gBarCol + 1 + i;
    const gridTemplate = `minmax(7rem, 9rem) repeat(${gNegatives.length}, minmax(9rem, 1fr)) 12px repeat(${gPositives.length}, minmax(9rem, 1fr))`;
    return (
      <div
        className="continuum-grid review-grid"
        data-testid={`${testIdPrefix}-grid`}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div style={{ gridColumn: 1, gridRow: 1 }} />
        {gNegatives.map((c, i) => (
          <div
            key={c.id}
            className="col-header col-negative"
            style={{ gridColumn: gColumnFor("negative", i), gridRow: 1 }}
          >
            {c.label}
          </div>
        ))}
        <div
          className="sufficient-bar"
          title="Sufficient Bar"
          style={{ gridColumn: gBarCol, gridRow: `1 / ${gridLayer.nodes.length + 2}` }}
        />
        {gPositives.map((c, i) => (
          <div
            key={c.id}
            className="col-header col-positive"
            style={{ gridColumn: gColumnFor("positive", i), gridRow: 1 }}
          >
            {c.label}
          </div>
        ))}
        {gridLayer.nodes.map((node, row) => (
          <div key={node.id} style={{ display: "contents" }}>
            <div className="connect-row-label" style={{ gridColumn: 1, gridRow: row + 2 }}>
              {node.name}
            </div>
            {gNegatives.map((c, i) =>
              mesoCell(node, c, gColumnFor("negative", i), row + 2, testIdPrefix),
            )}
            {gPositives.map((c, i) =>
              mesoCell(node, c, gColumnFor("positive", i), row + 2, testIdPrefix),
            )}
          </div>
        ))}
      </div>
    );
  };

  const negatives = negativeColumns(judgement.continuum);
  const positives = positiveColumns(judgement.continuum);
  const barCol = 2 + negatives.length;
  const gridTemplateColumns = `minmax(7rem, 8rem) repeat(${negatives.length}, minmax(12rem, 1fr)) 12px repeat(${positives.length}, minmax(12rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 2 : barCol + 1 + i;
  const rowCount = judgement.decisionRowEnabled ? 4 : 3;

  const headerCell = (column: Column, side: "negative" | "positive", i: number) => {
    const canRemove = (side === "negative" ? negatives.length : positives.length) > 1;
    return (
      <div
        key={column.id}
        className={`col-header col-${side}`}
        style={{ gridColumn: columnFor(side, i), gridRow: 1 }}
      >
        <div className="col-header-top">
          <span className="col-side-tag">
            {side === "negative" ? "below the bar" : "above the bar"}
          </span>
          <button
            type="button"
            className="chip-remove"
            data-testid={`syn-remove-column-${column.ordinal}`}
            disabled={!canRemove}
            title={
              canRemove
                ? "Remove this column"
                : `Keep at least one column ${side === "negative" ? "below" : "above"} the bar`
            }
            aria-label={`Remove synthesis column ${column.ordinal}`}
            onClick={() => removeJudgementColumn(column.id)}
          >
            ×
          </button>
        </div>
        <input
          data-testid={`syn-column-label-${column.ordinal}`}
          placeholder="Column Header"
          value={column.label}
          onFocus={clearTarget}
          onChange={(e) => setJudgementColumnLabel(column.id, e.target.value)}
        />
      </div>
    );
  };

  const decisionCell = (column: Column, side: "negative" | "positive", i: number) => (
    <div
      key={column.id}
      className="review-cell syn-cell"
      style={{ gridColumn: columnFor(side, i), gridRow: 2 }}
    >
      <textarea
        rows={2}
        data-testid={`syn-decision-${column.ordinal}`}
        placeholder="The decision anticipated at this level."
        value={judgement.decisionCells.find((c) => c.columnId === column.id)?.text ?? ""}
        onFocus={clearTarget}
        onChange={(e) => setDecisionCellText(column.id, e.target.value)}
      />
    </div>
  );

  const plainRow = judgement.decisionRowEnabled ? 3 : 2;
  const plainCell = (column: Column, side: "negative" | "positive", i: number) => (
    <div
      key={column.id}
      className="review-cell syn-cell"
      style={{ gridColumn: columnFor(side, i), gridRow: plainRow }}
    >
      <textarea
        rows={3}
        data-testid={`syn-plain-${column.ordinal}`}
        placeholder="In plain words: the Overall Judgement at this level."
        value={
          judgement.plainDescriptionCells.find((c) => c.columnId === column.id)?.text ??
          ""
        }
        onFocus={clearTarget}
        onChange={(e) => setJudgementPlainDescription(column.id, e.target.value)}
      />
    </div>
  );

  const scenarioBox = (column: Column, scenario: JudgementScenario, i: number) => (
    <div key={scenario.id} className="scenario-slot">
      {i > 0 && <div className="scenario-or">OR</div>}
      <div
        className={
          activeScenarioId === scenario.id ? "scenario-box active" : "scenario-box"
        }
      >
        <div className="scenario-box-header">
          <span className="col-side-tag">Scenario {i + 1}</span>
          <button
            type="button"
            className="chip-remove"
            aria-label={`Remove synthesis scenario ${i + 1} for ${column.label}`}
            title="Remove this scenario (moves to the Recycle Bin)"
            onClick={() => {
              if (activeScenarioId === scenario.id) setActiveScenarioId(null);
              removeJudgementScenario(scenario.id);
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
          nameFor={(id) =>
            doc.mesoLayers.flatMap((l) => l.nodes).find((n) => n.id === id)?.name ??
            "(unnamed)"
          }
          columnLabelFor={mesoColumnLabel}
          onChange={(parts) => updateJudgementScenarioParts(scenario.id, parts)}
          onFocus={() => setActiveScenarioId(scenario.id)}
          placeholder={`Which ${nodeLabel} conclusions, together, yield this judgement — and what must hold for each.`}
          label={`Synthesis scenario ${i + 1} for "${column.label}"`}
          testId={`syn-scenario-${column.ordinal}-${i}`}
        />
        {activeScenarioId === scenario.id &&
          scenario.parts.some((p) => p.kind === "token") && (
            <select
              className="operator-select"
              aria-label={`Insert an operator into scenario ${i + 1} for ${column.label}`}
              data-testid={`syn-operator-${column.ordinal}-${i}`}
              value=""
              onChange={(e) => {
                // ⚠Q47: the pick lands in the prose as plain text at the caret
                // — a typing aid, not stored logic (Q10 stands).
                if (e.target.value !== "") {
                  editors.current.get(scenario.id)?.insertText(`${e.target.value} `);
                }
              }}
            >
              <option value="">+ operator…</option>
              {OPERATOR_OPTIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          )}
      </div>
    </div>
  );

  const conditionsCell = (column: Column, side: "negative" | "positive", i: number) => {
    const scenarios = judgement.scenarios
      .filter((s) => s.yieldsColumnId === column.id)
      .sort((a, b) => a.order - b.order);
    return (
      <div
        key={column.id}
        className="evidence-cell"
        data-testid={`syn-conditions-${column.ordinal}`}
        style={{ gridColumn: columnFor(side, i), gridRow: rowCount }}
      >
        {scenarios.map((s, si) => scenarioBox(column, s, si))}
        <button
          type="button"
          className="secondary"
          data-testid={`syn-add-scenario-${column.ordinal}`}
          onClick={() => addJudgementScenario(column.id)}
        >
          + Add scenario
        </button>
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Build the Overall Judgement</h2>
      <p>
        Author the synthesis rubric on the left; your {nodeLabel} rubric stays readable
        on the right. In the <strong>{nodeLabel} conditions</strong> row, click into a
        scenario, then click a {nodeLabel}&apos;s cell on the right to drop{" "}
        <strong>its name and that conclusion</strong> into the prose — then write what
        about that {nodeLabel}&apos;s conclusion must hold.
      </p>

      <div className="synthesis-split">
        <div className="synthesis-side" data-testid="synthesis-rubric-panel">
          <div className="synthesis-toolbar">
            <button
              type="button"
              className="secondary"
              data-testid="syn-add-negative-column"
              onClick={() => addJudgementColumn("negative")}
            >
              + Column below the bar
            </button>
            <button
              type="button"
              className="secondary"
              data-testid="syn-add-positive-column"
              onClick={() => addJudgementColumn("positive")}
            >
              + Column above the bar
            </button>
            <label className="decision-toggle">
              <input
                type="checkbox"
                data-testid="syn-decision-toggle"
                checked={judgement.decisionRowEnabled}
                onChange={toggleDecisionRow}
              />
              Decision row
            </label>
          </div>

          <div
            className="continuum-grid review-grid synthesis-grid"
            data-testid="synthesis-grid"
            style={{ gridTemplateColumns }}
          >
            <div style={{ gridColumn: 1, gridRow: 1 }} />
            {negatives.map((c, i) => headerCell(c, "negative", i))}
            <div
              className="sufficient-bar"
              data-testid="syn-sufficient-bar"
              title="Sufficient Bar"
              style={{ gridColumn: barCol, gridRow: `1 / ${rowCount + 1}` }}
            />
            {positives.map((c, i) => headerCell(c, "positive", i))}

            {judgement.decisionRowEnabled && (
              <>
                <div className="connect-row-label" style={{ gridColumn: 1, gridRow: 2 }}>
                  Decision
                </div>
                {negatives.map((c, i) => decisionCell(c, "negative", i))}
                {positives.map((c, i) => decisionCell(c, "positive", i))}
              </>
            )}

            <div className="connect-row-label" style={{ gridColumn: 1, gridRow: plainRow }}>
              Final judgement (plain description)
            </div>
            {negatives.map((c, i) => plainCell(c, "negative", i))}
            {positives.map((c, i) => plainCell(c, "positive", i))}

            <div className="connect-row-label" style={{ gridColumn: 1, gridRow: rowCount }}>
              Final judgement ({nodeLabel} conditions)
            </div>
            {negatives.map((c, i) => conditionsCell(c, "negative", i))}
            {positives.map((c, i) => conditionsCell(c, "positive", i))}
          </div>

          <label className="synthesis-free-text">
            Or write the whole synthesis in your own words instead (R-112 escape hatch —
            this satisfies the step by itself)
            <textarea
              rows={3}
              data-testid="syn-free-text"
              value={judgement.freeTextOverride ?? ""}
              onFocus={clearTarget}
              onChange={(e) => setSynthesisFreeText(e.target.value)}
            />
          </label>
        </div>

        {/* The click-to-reference panel: right side, same colour shape as
            J10's methods panel, greyed until a criterion-conditions scenario
            is focused (2026-07-14 notes). */}
        <div
          className={
            activeScenarioId
              ? "synthesis-side click-panel"
              : "synthesis-side click-panel click-panel-disabled"
          }
          data-testid="synthesis-meso-panel"
        >
          <h3>
            Your {layer.kind === "criteria" ? "criteria" : "components"} (click a cell
            to reference it)
          </h3>
          <p className="hint" data-testid="click-panel-hint">
            {activeScenarioId
              ? `Click a cell: "«name» is «conclusion»" lands in the highlighted scenario.`
              : `These cells reference your meso layer(s) only in the final judgement (${nodeLabel} conditions) row — click into one of its scenarios first.`}
          </p>
          {/* Superior layer first (Q53), then the subordinate layer when both
              feed the judgement. Single-layer frameworks show only their one
              layer. */}
          {secondFeedLayer && (
            <h4 className="meso-grid-label">
              {layer.kind === "criteria" ? "Criteria" : "Components"} (judged directly)
            </h4>
          )}
          {renderMesoGrid(layer, "meso-cell")}
          {secondFeedLayer && (
            <>
              <h4 className="meso-grid-label">
                {secondFeedLayer.kind === "criteria" ? "Criteria" : "Components"} (roll up
                into the {layer.kind === "criteria" ? "criteria" : "components"} above)
              </h4>
              {renderMesoGrid(secondFeedLayer, "meso-cell-sub")}
            </>
          )}

          <div className="collective-controls">
            <h4>Collective references</h4>
            <button
              type="button"
              className="secondary"
              data-testid="insert-all-other"
              disabled={!activeScenarioId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertCollective(`all other ${layer.kind === "criteria" ? "criteria" : "components"}`)}
            >
              + all other {layer.kind === "criteria" ? "criteria" : "components"}
            </button>
            <div className="collective-custom">
              <input
                data-testid="custom-group-name"
                placeholder={`A group of ${layer.kind} in your own words (e.g. "the delivery ${layer.kind}")`}
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                data-testid="insert-custom-group"
                disabled={!activeScenarioId || customGroup.trim() === ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  insertCollective(customGroup);
                  setCustomGroup("");
                }}
              >
                Insert group
              </button>
            </div>
          </div>
        </div>
      </div>

      <JudgementConditionBuilder doc={doc} />

      <WizardNav
        continueTestId="synthesis-continue"
        onContinue={() => {
          const gates = checkSynthesisComplete(doc);
          setGateMessages(gates.map((g) => g.message));
          if (gates.length === 0) setView(firstIncompleteView(doc));
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
