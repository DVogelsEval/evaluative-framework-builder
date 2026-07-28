import { useState } from "react";
import { deletedItems } from "../domain/recycleBin";
import { useStore } from "../store/store";

/**
 * The Deleted view (Slice 10, R-149/Q18): a window onto everything the user has
 * deleted from this Evaluation Question — nothing is ever hard-deleted
 * (Invariant 20). Reached from the Home Window. Each item can be **restored**
 * back into the framework (R-149/⚠Q56): restore puts it back where it came from
 * when that container still exists, or explains why it can't (e.g. "restore the
 * layer first"). Restored items leave the list; the message reports the outcome.
 */
export function DeletedView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  const restoreDeleted = useStore((s) => s.restoreDeleted);
  const [message, setMessage] = useState<string | null>(null);
  if (!doc) return null;
  const items = deletedItems(doc);

  return (
    <section className="panel" data-testid="deleted-view">
      <h2>Deleted items</h2>
      <p className="hint">
        Everything you have deleted from this Evaluation Question, most recent first.
        Nothing is hard-deleted — <strong>Restore</strong> puts an item back into the
        framework.
      </p>
      {items.length === 0 ? (
        <p data-testid="deleted-empty">Nothing has been deleted yet.</p>
      ) : (
        <ul className="deleted-list">
          {items.map((item) => (
            <li
              key={item.index}
              className="deleted-item"
              data-testid={`deleted-item-${item.index}`}
            >
              <span className="box-kind">{item.kind}</span>
              <span className="deleted-label">{item.label || "(no details)"}</span>
              <span className="hint">{new Date(item.deletedAt).toLocaleString()}</span>
              <button
                type="button"
                className="secondary"
                data-testid={`restore-item-${item.index}`}
                onClick={() => {
                  const result = restoreDeleted(item.index);
                  setMessage(
                    result.restored
                      ? `Restored: ${result.kind}.`
                      : (result.reason ?? "Couldn't restore that item."),
                  );
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {message !== null && (
        <p role="status" className="save-status" data-testid="restore-status">
          {message}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        data-testid="deleted-back-home"
        onClick={() => setView("home")}
      >
        ← Home Window
      </button>
    </section>
  );
}
