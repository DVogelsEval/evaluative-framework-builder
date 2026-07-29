import { entriesForNodeAndDescendants, labelForRef } from "../domain/recordRef";
import type { MesoLayer, MesoNode, RecordPrompt } from "../domain/schema";
import { useStore } from "../store/store";

const PROMPT_LABELS: Record<RecordPrompt, string> = {
  objection: "An objection was raised",
  evidence: "New evidence came in",
  "stakeholder-session": "A stakeholder session",
  "internal-review": "Internal review",
  "reviewer-critique": "A reviewer's critique",
  freeze: "Freeze",
  other: "Other",
};

function findNodeAndLayer(
  layers: MesoLayer[],
  nodeId: string,
): { node: MesoNode; layer: MesoLayer } | undefined {
  for (const layer of layers) {
    const node = layer.nodes.find((n) => n.id === nodeId);
    if (node) return { node, layer };
  }
  return undefined;
}

function conditionSummary(cell: MesoNode["cells"][number]): string | null {
  const condition = cell.condition;
  if (!condition) return null;
  if (condition.mode === "boolean") {
    return condition.booleanLogic?.plainEnglish || "(boolean condition, not yet built)";
  }
  return condition.proseDescription || "(prose condition, empty)";
}

/**
 * The criterion timeline (docs/ROADMAP-V2.md §3.1): current state plus every
 * RecordEntry affecting this node or its descendants (importance, cells,
 * conditions), dated. A view over Phase 1 data — no new persisted field.
 */
export function CriterionTimelineView() {
  const doc = useStore((s) => s.doc);
  const focusNodeId = useStore((s) => s.focusNodeId);
  const setView = useStore((s) => s.setView);
  if (!doc || !focusNodeId) return null;

  const found = findNodeAndLayer(doc.mesoLayers, focusNodeId);
  if (!found) return null;
  const { node, layer } = found;
  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const entries = entriesForNodeAndDescendants(doc, node.id);
  const columnLabel = (columnId: string) =>
    layer.continuum.columns.find((c) => c.id === columnId)?.label || "(unnamed)";

  return (
    <section className="panel" data-testid="criterion-timeline-view">
      <h2>Criterion timeline — {node.name || `(unnamed ${nodeLabel})`}</h2>
      <p className="hint">
        Current state, then every reasoned change recorded against this {nodeLabel} or its
        cells, most recent first.
      </p>

      <div className="panel-section" data-testid="criterion-timeline-current-state">
        <h3>Current state</h3>
        <p>
          <strong>Links to the question:</strong> {node.linkToQuestion || "(none yet)"}
        </p>
        <p>
          <strong>Links to values:</strong> {node.linkToValues || "(none yet)"}
        </p>
        <p>
          <strong>Decisions/use:</strong> {node.decisionsOrUse || "(none yet)"}
        </p>
        <ul>
          {node.cells.map((cell) => {
            const condition = conditionSummary(cell);
            return (
              <li key={cell.id}>
                <strong>{columnLabel(cell.columnId)}</strong>
                {!cell.included && " (excluded)"}
                {cell.plainDescription && <> — {cell.plainDescription}</>}
                {condition && <> · condition: {condition}</>}
              </li>
            );
          })}
        </ul>
      </div>

      {entries.length === 0 ? (
        <p data-testid="criterion-timeline-empty">No recorded changes for this {nodeLabel} yet.</p>
      ) : (
        <ul className="records-list" data-testid="criterion-timeline-entries">
          {entries.map((entry) => (
            <li key={entry.id} className="record-item" data-testid={`criterion-timeline-entry-${entry.id}`}>
              <div className="record-item-head">
                <strong>{entry.timestamp.slice(0, 10)}</strong>
                <span>{entry.author.trim() || "(unattributed)"}</span>
                <span className="hint">({PROMPT_LABELS[entry.prompt]})</span>
              </div>
              <p>
                <strong>{labelForRef(doc, entry.elementRef)}</strong> — {entry.changeSummary}
              </p>
              <p className="hint">Reason: {entry.reason}</p>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="secondary"
        data-testid="criterion-timeline-back"
        onClick={() => {
          useStore.setState({ focusNodeId: node.id });
          setView("criterion");
        }}
      >
        ← Back to {nodeLabel}
      </button>
    </section>
  );
}
