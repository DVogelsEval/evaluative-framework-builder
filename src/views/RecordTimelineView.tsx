import { useState } from "react";
import { labelForRef } from "../domain/recordRef";
import type { RecordPrompt } from "../domain/schema";
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

/**
 * The framework timeline (docs/ROADMAP-V2.md §1.5): every RecordEntry in the
 * document, newest first, filterable by `prompt`. Reached from the Home
 * Window. Shows everything, including entries withheld from exports — that
 * flag only scopes exports (Phase 1.4), never the author's own view of their
 * own reasoning history.
 */
export function RecordTimelineView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  const setRecordIncludeInExport = useStore((s) => s.setRecordIncludeInExport);
  const removeRecordEntry = useStore((s) => s.removeRecordEntry);
  const [filter, setFilter] = useState<RecordPrompt | "all">("all");
  if (!doc) return null;

  const entries = [...doc.records]
    .filter((e) => filter === "all" || e.prompt === filter)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  return (
    <section className="panel" data-testid="records-view">
      <h2>Decision record — framework timeline</h2>
      <p className="hint">
        Every reasoned change recorded across this Evaluation Question, most recent first.
        This is the author's own view — it includes entries withheld from exports.
      </p>

      <label className="cond-field">
        <span>Filter by prompt</span>
        <select
          data-testid="records-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as RecordPrompt | "all")}
        >
          <option value="all">All</option>
          {(Object.keys(PROMPT_LABELS) as RecordPrompt[]).map((p) => (
            <option key={p} value={p}>
              {PROMPT_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {entries.length === 0 ? (
        <p data-testid="records-empty">No record entries yet.</p>
      ) : (
        <ul className="records-list">
          {entries.map((entry) => (
            <li key={entry.id} className="record-item" data-testid={`record-item-${entry.id}`}>
              <div className="record-item-head">
                <strong>{entry.timestamp.slice(0, 10)}</strong>
                <span>{entry.author.trim() || "(unattributed)"}</span>
                <span className="hint">({PROMPT_LABELS[entry.prompt]})</span>
              </div>
              <p>
                <strong>{labelForRef(doc, entry.elementRef)}</strong> — {entry.changeSummary}
              </p>
              <p className="hint">Reason: {entry.reason}</p>
              <label className="cond-field record-item-export-toggle">
                <input
                  type="checkbox"
                  data-testid={`record-include-${entry.id}`}
                  checked={entry.includeInExport}
                  onChange={(e) => setRecordIncludeInExport(entry.id, e.target.checked)}
                />
                <span>Include in exports</span>
              </label>
              <button
                type="button"
                className="chip-remove"
                data-testid={`record-remove-${entry.id}`}
                title="Remove (moves to the Recycle Bin)"
                onClick={() => removeRecordEntry(entry.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="secondary"
        data-testid="records-back-home"
        onClick={() => setView("home")}
      >
        ← Home Window
      </button>
    </section>
  );
}
