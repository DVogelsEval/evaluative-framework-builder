import { useStore } from "../store/store";

/**
 * The persistent per-EQ Notes pop-out (Slice 10, J0/J13 — R-030, Q19): one notes
 * area per Evaluation Question, openable/hidable from a button present in every
 * view, for an ongoing audit trail. It has no function beyond being shown/hidden
 * and edited; edits autosave with the document (R-014).
 */
export function NotesPanel({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const setNotes = useStore((s) => s.setNotes);
  if (!doc) return null;

  return (
    <aside
      className="notes-panel no-print"
      data-testid="notes-panel"
      role="dialog"
      aria-label="Notes"
    >
      <div className="notes-panel-header">
        <h3>Notes</h3>
        <button
          type="button"
          className="chip-remove"
          data-testid="notes-close"
          aria-label="Hide notes"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="hint">
        An ongoing audit trail for this Evaluation Question — jot down decisions and
        reasoning as you build. Available from every view.
      </p>
      <textarea
        data-testid="notes-textarea"
        rows={12}
        placeholder="Type your notes…"
        value={doc.notes ?? ""}
        onChange={(e) => setNotes(e.target.value)}
      />
    </aside>
  );
}
