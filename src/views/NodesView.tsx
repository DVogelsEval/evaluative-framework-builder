import { useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkNodeList } from "../domain/invariants";
import { canExcludeCell } from "../domain/meso";
import { refForNode } from "../domain/recordRef";
import type { Column, MesoNode } from "../domain/schema";
import { useStore, type NodeTextField } from "../store/store";
import { RecordPromptBanner } from "./RecordPromptBanner";
import { useRecordPrompt } from "./useRecordPrompt";
import { WizardNav } from "./WizardNav";

/**
 * J4: list the Criteria of Merit / Components (R-049, R-053, R-156/R-157) with
 * their three warrant fields (R-050–R-052), and rank each node's importance
 * as two select/deselect rows — positive and negative scale — over the shared
 * continuum (R-054/R-055). The ranking is qualitative reach only: it pre-sets
 * which cells open by default (Q6) and stores no numeric weight (Q11).
 */
export function NodesView() {
  const doc = useStore((s) => s.doc);
  const addNode = useStore((s) => s.addNode);
  const updateNodeField = useStore((s) => s.updateNodeField);
  const removeNode = useStore((s) => s.removeNode);
  const moveNode = useStore((s) => s.moveNode);
  const setImportanceReach = useStore((s) => s.setImportanceReach);
  const setView = useStore((s) => s.setView);
  const [gateMessages, setGateMessages] = useState<string[]>([]);
  // V2 record layer (Q64): adding/removing a node is load-bearing. Removal is
  // the clearer prompt point — adding a fresh, still-empty node has nothing
  // yet worth a reason.
  const recordPrompt = useRecordPrompt();

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const listTitle = layer.kind === "criteria" ? "Criteria of Merit" : "Components";
  const negatives = negativeColumns(layer.continuum);
  const positives = positiveColumns(layer.continuum);

  const textField = (
    node: MesoNode,
    field: NodeTextField,
    label: string,
    testId: string,
  ) => (
    <label className="node-field">
      {label}
      <textarea
        rows={2}
        data-testid={`${testId}-${node.order}`}
        value={node[field]}
        onChange={(e) => updateNodeField(node.id, field, e.target.value)}
      />
    </label>
  );

  const reachRow = (node: MesoNode, columns: Column[], sideLabel: string) => (
    <div className="reach-row">
      <span className="reach-row-label">{sideLabel}</span>
      {columns.map((column) => {
        const reached = node.cells.find((c) => c.columnId === column.id)?.included ?? true;
        const locked = reached && !canExcludeCell(node, layer.continuum, column.id);
        return (
          <button
            key={column.id}
            type="button"
            className={reached ? "reach-chip reach-on" : "reach-chip"}
            aria-pressed={reached}
            data-testid={`importance-${node.order}-${column.ordinal}`}
            disabled={locked}
            title={
              locked
                ? `Keep at least one reachable conclusion ${sideLabel.toLowerCase()}`
                : `Toggle whether "${node.name || `this ${nodeLabel}`}" can reach "${column.label}"`
            }
            onClick={() => setImportanceReach(node.id, column.id, !reached)}
          >
            {column.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="panel">
      <h2>List the {listTitle}</h2>
      <p>
        Add each {nodeLabel}, say how it links to the question and to stakeholder or
        program values, and how it will inform decisions or use.
      </p>

      {layer.nodes.map((node, i) => (
        <div key={node.id} className="node-card" data-testid={`node-card-${node.order}`}>
          <div className="node-card-header">
            <div className="reorder-controls">
              <button
                type="button"
                data-testid={`move-up-${node.order}`}
                disabled={i === 0}
                aria-label={`Move "${node.name}" up`}
                onClick={() => moveNode(node.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                data-testid={`move-down-${node.order}`}
                disabled={i === layer.nodes.length - 1}
                aria-label={`Move "${node.name}" down`}
                onClick={() => moveNode(node.id, 1)}
              >
                ↓
              </button>
            </div>
            <input
              className="node-name"
              data-testid={`node-name-${node.order}`}
              placeholder={`${layer.kind === "criteria" ? "Criterion" : "Component"} name`}
              value={node.name}
              onChange={(e) => updateNodeField(node.id, "name", e.target.value)}
            />
            <button
              type="button"
              className="chip-remove"
              data-testid={`remove-node-${node.order}`}
              aria-label={`Remove "${node.name}"`}
              title="Remove (moves to the Recycle Bin)"
              onClick={() => {
                const name = node.name;
                removeNode(node.id);
                recordPrompt.offer({
                  elementRef: refForNode(node.id),
                  changeSummary: `Removed ${nodeLabel} "${name || "(unnamed)"}".`,
                  previousValue: name,
                });
              }}
            >
              ×
            </button>
          </div>

          <div className="node-fields">
            {textField(node, "linkToQuestion", "How it links to the Evaluation Question", "node-link-question")}
            {textField(node, "linkToValues", "How it links to stakeholder / program values", "node-link-values")}
            {textField(node, "decisionsOrUse", "Decisions or use it will inform", "node-decisions")}
          </div>

          <div className="importance-block">
            <p className="hint">
              Importance / reach: which conclusions can this {nodeLabel} reach on each
              side of the Sufficient Bar? Deselected columns start greyed out in the next
              step (you can still change them there). Qualitative only — no numeric
              weighting.
            </p>
            {reachRow(node, positives, "Positive scale (above the bar)")}
            {reachRow(node, negatives, "Negative scale (below the bar)")}
          </div>
        </div>
      ))}

      <button type="button" className="secondary" data-testid="add-node" onClick={() => addNode()}>
        + Add {nodeLabel}
      </button>

      <RecordPromptBanner
        pending={recordPrompt.pending}
        onSave={recordPrompt.save}
        onDismiss={recordPrompt.dismiss}
        testId="nodes-record-prompt"
      />

      <WizardNav
        continueTestId="nodes-continue"
        onContinue={() => {
          const gates = checkNodeList(layer);
          setGateMessages(gates.map((g) => g.message));
          if (gates.length === 0) setView("criterion");
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
