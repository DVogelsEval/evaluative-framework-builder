import { useRef, useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import {
  secondLayerComplete,
  subordinateLayer,
  superiorLayer,
} from "../domain/layers";
import type { Cell, Column, EvaluationQuestion, MesoNode, Scenario } from "../domain/schema";
import { useStore } from "../store/store";
import { firstIncompleteView } from "../store/wizard";
import { BooleanEditor } from "./BooleanEditor";
import { ConditionModeToggle, useConditionMode } from "./ConditionMode";
import { ProseEditor } from "./ProseEditor";
import { TokenProseEditor, type TokenProseHandle } from "./TokenProseEditor";
import { WizardNav } from "./WizardNav";

/**
 * J3 completed — the optional second meso layer (Slice 7, R-045–R-047,
 * Q3/Q4/Q33). A single-layer framework can *grow* a layer above its meso tier:
 * the new layer is superior (tierOrder 1) and the existing one stays
 * subordinate, keeping its evidence (Q33). The superior layer is what the
 * Overall Judgement then synthesises (Q4) — this is the R-099 "combine [the
 * subordinate layer] to judge Components instead of final synthesis" offer.
 *
 * The view has two states:
 *  - **no second layer yet** — offer to add one (pick its kind), or continue
 *    straight to synthesis of the single layer.
 *  - **second layer present** — author its Column Headers and nodes, and roll
 *    every subordinate node up into a superior node (`parentNodeId`, R-046).
 *    The two-layer cap (Invariant 18, Q3) means no third layer is ever offered.
 *
 * Provisional v1 scope (⚠Q49): the new layer is always the *superior* one; the
 * superior layer is structure + headers only (no reach/plain-description/
 * evidence pass); completion gates on named nodes + filled headers + full
 * rollup. Flagged for owner override.
 *
 * Each superior node's interlayer connect pass (Q53/Q54) is one merged block
 * per node (Q75, mirroring Q74/D1 at the criterion layer): the scenario
 * columns and that column's condition (boolean or prose, `cell.condition`)
 * live together per column instead of in a separate condition panel after
 * them — see `SuperiorNodeInterlayer` below.
 */
export function SecondLayerView() {
  const doc = useStore((s) => s.doc);
  const addSecondMesoLayer = useStore((s) => s.addSecondMesoLayer);
  const removeSecondMesoLayer = useStore((s) => s.removeSecondMesoLayer);
  const addSuperiorNode = useStore((s) => s.addSuperiorNode);
  const renameSuperiorNode = useStore((s) => s.renameSuperiorNode);
  const removeSuperiorNode = useStore((s) => s.removeSuperiorNode);
  const setColumnLabel = useStore((s) => s.setColumnLabel);
  const addSuperiorColumn = useStore((s) => s.addSuperiorColumn);
  const removeSuperiorColumn = useStore((s) => s.removeSuperiorColumn);
  const setNodeParent = useStore((s) => s.setNodeParent);
  const setView = useStore((s) => s.setView);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  // The inter-layer scenario a subordinate-cell click inserts into (Q54): set
  // by focusing a superior-node conditional-statement editor.
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const editors = useRef(new Map<string, TokenProseHandle>());

  if (!doc) return null;
  const subordinate = subordinateLayer(doc);
  const superior = superiorLayer(doc);
  if (!subordinate) return null;

  const subKind = subordinate.kind === "criteria" ? "criteria" : "components";
  const subNodeLabel = subordinate.kind === "criteria" ? "criterion" : "component";
  // The natural other kind to grow, though either is allowed.
  const suggestedKind: "criteria" | "components" =
    subordinate.kind === "criteria" ? "components" : "criteria";

  // ---- No second layer yet: the offer (R-099) --------------------------------
  if (!superior) {
    return (
      <section className="panel" data-testid="second-layer-offer">
        <h2>Group your {subKind} under a higher layer?</h2>
        <p>
          Your {subKind} can roll up into a second layer that the Overall Judgement
          then synthesises — for example, grouping {subKind} under{" "}
          <strong>Components</strong> of the evaluand, each judged in turn. This is
          optional; you can instead synthesise the {subKind} directly.
        </p>
        <div className="structure-choices">
          <button
            type="button"
            className="structure-choice"
            data-testid="add-components-layer"
            onClick={() => addSecondMesoLayer("components")}
          >
            <strong>Add a Components layer above</strong>
            <span>Group these {subKind} under Components that feed the final judgement.</span>
          </button>
          <button
            type="button"
            className="structure-choice"
            data-testid="add-criteria-layer"
            onClick={() => addSecondMesoLayer("criteria")}
          >
            <strong>Add a Criteria layer above</strong>
            <span>Group these {subKind} under higher-level Criteria of Merit.</span>
          </button>
        </div>
        <p className="hint">
          Suggested for your framework: a <strong>{suggestedKind}</strong> layer.
          Evidence stays on your {subKind} (the layer below); the new layer sits above
          and is what the synthesis judges.
        </p>
        <WizardNav
          continueTestId="second-layer-skip"
          continueLabel="Skip — synthesise the single layer"
          onContinue={() => setView(firstIncompleteView(doc))}
        />
      </section>
    );
  }

  // ---- Second layer present: the editor --------------------------------------
  const supKind = superior.kind === "criteria" ? "criteria" : "components";
  const supNodeLabel = superior.kind === "criteria" ? "criterion" : "component";
  const negatives = negativeColumns(superior.continuum);
  const positives = positiveColumns(superior.continuum);

  // ---- Inter-layer connect pass plumbing (Q53/Q54) ---------------------------
  // Shown once every subordinate node is rolled up (Q54 (a)). Tokens name
  // subordinate nodes and carry the clicked subordinate rubric column.
  const superiorIds = new Set(superior.nodes.map((n) => n.id));
  const allRolledUp =
    superior.nodes.length > 0 &&
    subordinate.nodes.every(
      (n) => n.parentNodeId !== undefined && superiorIds.has(n.parentNodeId),
    );
  const subNegatives = negativeColumns(subordinate.continuum);
  const subPositives = positiveColumns(subordinate.continuum);
  const subNodeName = (id: string) =>
    subordinate.nodes.find((n) => n.id === id)?.name ?? "(unnamed)";
  const subColumnLabel = (id: string) =>
    subordinate.continuum.columns.find((c) => c.id === id)?.label ??
    "(removed conclusion)";
  const insertSubToken = (subNodeId: string, columnId: string) => {
    if (activeScenarioId) {
      editors.current.get(activeScenarioId)?.insertToken(subNodeId, columnId);
    }
  };
  const clearTarget = () => setActiveScenarioId(null);

  // The subordinate rubric as the click panel (Q54 (a), same shape as J11's
  // methods/meso panel): click a subordinate cell to drop "«node» is «header»"
  // into the focused superior scenario.
  const subCell = (node: MesoNode, column: Column, gridColumn: number, gridRow: number) => {
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
        data-testid={`sub-cell-${node.order}-${column.ordinal}`}
        style={{ gridColumn, gridRow }}
        title={
          activeScenarioId
            ? `Insert "${node.name} is ${column.label}" into the highlighted scenario`
            : `Click into a ${supNodeLabel} scenario first`
        }
        disabled={!activeScenarioId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => insertSubToken(node.id, column.id)}
      >
        {cell.plainDescription}
      </button>
    );
  };

  return (
    <section className="panel" data-testid="second-layer-editor">
      <h2>Your {supKind} layer</h2>
      <p>
        Author the {supKind} that sit above your {subKind}, then roll each{" "}
        {subNodeLabel} up into the {supNodeLabel} it belongs to. The Overall Judgement
        will synthesise these {supKind}.
      </p>

      {/* Superior continuum headers (its shared conclusion scale) */}
      <div className="second-layer-continuum">
        <h3>Conclusions for the {supKind} layer</h3>
        <div className="reach-row">
          <span className="reach-row-label">Below the bar</span>
          {negatives.map((c) => (
            <span key={c.id} className="column-edit">
              <input
                data-testid={`superior-column-${c.ordinal}`}
                placeholder="Column Header"
                value={c.label}
                onFocus={clearTarget}
                onChange={(e) => setColumnLabel(c.id, e.target.value)}
              />
              <button
                type="button"
                className="chip-remove"
                data-testid={`superior-remove-column-${c.ordinal}`}
                disabled={negatives.length <= 1}
                aria-label={`Remove ${supKind} column ${c.ordinal}`}
                title={negatives.length <= 1 ? "Keep at least one column below the bar" : "Remove"}
                onClick={() => removeSuperiorColumn(c.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="secondary"
            data-testid="superior-add-negative"
            onClick={() => addSuperiorColumn("negative")}
          >
            +
          </button>
        </div>
        <div className="reach-row">
          <span className="reach-row-label">Above the bar</span>
          {positives.map((c) => (
            <span key={c.id} className="column-edit">
              <input
                data-testid={`superior-column-${c.ordinal}`}
                placeholder="Column Header"
                value={c.label}
                onFocus={clearTarget}
                onChange={(e) => setColumnLabel(c.id, e.target.value)}
              />
              <button
                type="button"
                className="chip-remove"
                data-testid={`superior-remove-column-${c.ordinal}`}
                disabled={positives.length <= 1}
                aria-label={`Remove ${supKind} column ${c.ordinal}`}
                title={positives.length <= 1 ? "Keep at least one column above the bar" : "Remove"}
                onClick={() => removeSuperiorColumn(c.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="secondary"
            data-testid="superior-add-positive"
            onClick={() => addSuperiorColumn("positive")}
          >
            +
          </button>
        </div>
      </div>

      {/* Superior nodes */}
      <div className="second-layer-nodes">
        <h3>{superior.kind === "criteria" ? "Criteria of Merit" : "Components"}</h3>
        {superior.nodes.map((node) => (
          <div
            key={node.id}
            className="node-card-header"
            data-testid={`superior-node-${node.order}`}
          >
            <input
              className="node-name"
              data-testid={`superior-node-name-${node.order}`}
              placeholder={`${supNodeLabel === "criterion" ? "Criterion" : "Component"} name`}
              value={node.name}
              onFocus={clearTarget}
              onChange={(e) => renameSuperiorNode(node.id, e.target.value)}
            />
            <button
              type="button"
              className="chip-remove"
              data-testid={`superior-remove-node-${node.order}`}
              aria-label={`Remove "${node.name}"`}
              title="Remove (moves to the Recycle Bin)"
              onClick={() => removeSuperiorNode(node.id)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          data-testid="add-superior-node"
          onClick={() => addSuperiorNode()}
        >
          + Add {supNodeLabel}
        </button>
      </div>

      {/* Rollup: each subordinate node picks its parent (R-046) */}
      <div className="second-layer-rollup">
        <h3>
          Roll each {subNodeLabel} up into a {supNodeLabel}
        </h3>
        {subordinate.nodes.map((node) => (
          <label key={node.id} className="rollup-row" data-testid={`rollup-${node.order}`}>
            <span className="rollup-child">{node.name}</span>
            <select
              data-testid={`rollup-select-${node.order}`}
              value={node.parentNodeId ?? ""}
              onFocus={clearTarget}
              onChange={(e) => setNodeParent(node.id, e.target.value === "" ? null : e.target.value)}
            >
              <option value="">— choose a {supNodeLabel} —</option>
              {superior.nodes.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name || `(unnamed ${supNodeLabel})`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* Inter-layer connect pass (Q53/Q54): once every subordinate node is
          rolled up, connect the subordinate conclusions "up" into the superior
          layer the same way evidence connects to criteria (J10). Encouraged,
          never gated (Q54 (b)). */}
      {allRolledUp && (
        <div className="second-layer-connect" data-testid="interlayer-connect">
          <h3>
            Connect your {subKind} up into these {supKind}
          </h3>
          <p>
            For each {supNodeLabel} conclusion, describe the {subNodeLabel}{" "}
            conclusions that, together, reach it. Click into a scenario, then click
            a {subNodeLabel}&apos;s cell on the right to drop{" "}
            <strong>its name and that conclusion</strong> into the prose — then write
            what must hold. This is optional.
          </p>
          <div className="synthesis-split">
            <div className="synthesis-side">
              {superior.nodes.map((node) => (
                <SuperiorNodeInterlayer
                  key={node.id}
                  node={node}
                  doc={doc}
                  negatives={negatives}
                  positives={positives}
                  supNodeLabel={supNodeLabel}
                  subNodeLabel={subNodeLabel}
                  activeScenarioId={activeScenarioId}
                  setActiveScenarioId={setActiveScenarioId}
                  editors={editors}
                  subNodeName={subNodeName}
                  subColumnLabel={subColumnLabel}
                />
              ))}
            </div>

            {/* The subordinate rubric click panel — greyed until a superior
                scenario is focused (same mechanics as J11). */}
            <div
              className={
                activeScenarioId
                  ? "synthesis-side click-panel"
                  : "synthesis-side click-panel click-panel-disabled"
              }
              data-testid="interlayer-sub-panel"
            >
              <h4>Your {subKind} (click a cell to reference it)</h4>
              <p className="hint" data-testid="interlayer-panel-hint">
                {activeScenarioId
                  ? `Click a cell: "«${subNodeLabel} name» is «conclusion»" lands in the highlighted scenario.`
                  : `Click into a ${supNodeLabel} scenario first, then click a ${subNodeLabel} cell to reference it.`}
              </p>
              <div
                className="continuum-grid review-grid"
                style={{
                  gridTemplateColumns: `minmax(7rem, 9rem) repeat(${subNegatives.length}, minmax(9rem, 1fr)) 12px repeat(${subPositives.length}, minmax(9rem, 1fr))`,
                }}
              >
                <div style={{ gridColumn: 1, gridRow: 1 }} />
                {subNegatives.map((c, i) => (
                  <div
                    key={c.id}
                    className="col-header col-negative"
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                  >
                    {c.label}
                  </div>
                ))}
                <div
                  className="sufficient-bar"
                  title="Sufficient Bar"
                  style={{
                    gridColumn: 2 + subNegatives.length,
                    gridRow: `1 / ${subordinate.nodes.length + 2}`,
                  }}
                />
                {subPositives.map((c, i) => (
                  <div
                    key={c.id}
                    className="col-header col-positive"
                    style={{ gridColumn: 2 + subNegatives.length + 1 + i, gridRow: 1 }}
                  >
                    {c.label}
                  </div>
                ))}
                {subordinate.nodes.map((node, row) => (
                  <div key={node.id} style={{ display: "contents" }}>
                    <div
                      className="connect-row-label"
                      style={{ gridColumn: 1, gridRow: row + 2 }}
                    >
                      {node.name}
                    </div>
                    {subNegatives.map((c, i) => subCell(node, c, i + 2, row + 2))}
                    {subPositives.map((c, i) =>
                      subCell(node, c, 2 + subNegatives.length + 1 + i, row + 2),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="link-button"
        data-testid="remove-second-layer"
        onClick={() => {
          removeSecondMesoLayer();
          setGateMessage(null);
        }}
      >
        Remove this layer — synthesise the {subKind} directly instead
      </button>

      <WizardNav
        continueTestId="second-layer-continue"
        onContinue={() => {
          if (!secondLayerComplete(doc)) {
            setGateMessage(
              `Give every ${supNodeLabel} a name, fill every Column Header, and roll every ${subNodeLabel} up into a ${supNodeLabel} first.`,
            );
            return;
          }
          setGateMessage(null);
          setView(firstIncompleteView(doc));
        }}
      />
      {gateMessage && (
        <p role="alert" className="error">
          {gateMessage}
        </p>
      )}
    </section>
  );
}

/**
 * One superior node's interlayer connect pass (Q53/Q54), merged per column
 * (Q75): each column of the superior continuum shows its subordinate-facing
 * prose scenarios (reusing the J10/J11 TokenProseEditor + Scenario parts
 * shape verbatim — Q53 reading point 3) immediately followed by that same
 * column's condition (boolean or prose, `cell.condition`) — the field
 * previously edited in a separate `ConditionBuilder` panel after all the
 * columns, duplicating the cell the same way J10 did before Q74. Calls
 * `useConditionMode` once per node instance, so each superior node keeps its
 * own session-local Boolean/Prose toggle.
 */
function SuperiorNodeInterlayer({
  node,
  doc,
  negatives,
  positives,
  supNodeLabel,
  subNodeLabel,
  activeScenarioId,
  setActiveScenarioId,
  editors,
  subNodeName,
  subColumnLabel,
}: {
  node: MesoNode;
  doc: EvaluationQuestion;
  negatives: Column[];
  positives: Column[];
  supNodeLabel: string;
  subNodeLabel: string;
  activeScenarioId: string | null;
  setActiveScenarioId: (id: string | null) => void;
  editors: React.MutableRefObject<Map<string, TokenProseHandle>>;
  subNodeName: (id: string) => string;
  subColumnLabel: (id: string) => string;
}) {
  const addSuperiorScenario = useStore((s) => s.addSuperiorScenario);
  const removeSuperiorScenario = useStore((s) => s.removeSuperiorScenario);
  const updateSuperiorScenarioParts = useStore((s) => s.updateSuperiorScenarioParts);
  const cond = useConditionMode(node, doc);

  const scenarioBox = (
    cell: Cell,
    column: Column,
    scenario: Scenario,
    i: number,
  ) => (
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
            aria-label={`Remove scenario ${i + 1} for ${node.name} at ${column.label}`}
            title="Remove this scenario (moves to the Recycle Bin)"
            onClick={() => {
              if (activeScenarioId === scenario.id) setActiveScenarioId(null);
              removeSuperiorScenario(node.id, cell.id, scenario.id);
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
          nameFor={subNodeName}
          columnLabelFor={subColumnLabel}
          onChange={(parts) =>
            updateSuperiorScenarioParts(node.id, cell.id, scenario.id, parts)
          }
          onFocus={() => setActiveScenarioId(scenario.id)}
          placeholder={`Which ${subNodeLabel} conclusions, together, make this ${supNodeLabel} reach “${column.label}” — and what must hold for each.`}
          label={`Condition for ${node.name} at ${column.label}`}
          testId={`superior-scenario-${node.order}-${column.ordinal}-${i}`}
        />
      </div>
    </div>
  );

  const columnBlock = (column: Column) => {
    const cell = node.cells.find((c) => c.columnId === column.id);
    if (!cell?.included) return null;
    const scenarios = [...cell.scenarios].sort((a, b) => a.order - b.order);
    return (
      <div key={column.id} className="interlayer-column">
        <div className="interlayer-column-head">{column.label || "(unnamed)"}</div>
        <div className="evidence-cell" data-testid={`superior-conditions-${node.order}-${column.ordinal}`}>
          {scenarios.map((s, i) => scenarioBox(cell, column, s, i))}
          <button
            type="button"
            className="secondary"
            data-testid={`superior-add-scenario-${node.order}-${column.ordinal}`}
            onClick={() => addSuperiorScenario(node.id, cell.id)}
          >
            + Add scenario
          </button>
        </div>
        <div
          className="conclusion-condition"
          data-testid={`superior-condition-${node.order}-${column.ordinal}`}
        >
          <h5>When this conclusion applies (optional)</h5>
          {cond.mode === "boolean" ? (
            <BooleanEditor
              node={node}
              cell={cell}
              elements={cond.elements}
              testId={`superior-bool-${node.order}-${column.ordinal}`}
            />
          ) : (
            <ProseEditor
              node={node}
              cell={cell}
              testId={`superior-prose-${node.order}-${column.ordinal}`}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="interlayer-node" data-testid={`interlayer-node-${node.order}`}>
      <div
        className="cond-panel-head"
        data-testid={`superior-condition-panel-${node.order}`}
      >
        <h4>{node.name || `(unnamed ${supNodeLabel})`}</h4>
        <ConditionModeToggle
          nodeId={node.id}
          mode={cond.mode}
          booleanAvailable={cond.booleanAvailable}
          onChoose={cond.chooseMode}
        />
      </div>
      {!cond.booleanAvailable && (
        <p className="hint" data-testid={`superior-condition-no-boolean-${node.order}`}>
          Boolean mode needs evidence elements to reference. Add Evidence/Methods to this
          node, or describe the condition in prose.
        </p>
      )}
      <div className="interlayer-columns">
        {negatives.map(columnBlock)}
        <div className="interlayer-bar" title="Sufficient Bar" aria-label="Sufficient Bar" />
        {positives.map(columnBlock)}
      </div>
    </div>
  );
}
