import { useState } from "react";
import type { RecordPrompt } from "../domain/schema";
import type { PendingRecordPrompt } from "./useRecordPrompt";

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
 * The dismissible, never-blocking "record why this changed" prompt (extension
 * spec §4.2). Renders nothing when there is nothing pending. `reason` is
 * required — Save stays disabled until it is non-empty, matching the schema's
 * own `reason: z.string().min(1)` (the whole point of this layer).
 */
export function RecordPromptBanner({
  pending,
  onSave,
  onDismiss,
  testId,
  lockedPrompt,
}: {
  pending: PendingRecordPrompt | null;
  onSave: (fields: { reason: string; prompt: RecordPrompt; author: string }) => void;
  onDismiss: () => void;
  testId: string;
  /** When set, the "Prompted by" field is fixed to this value and hidden —
   *  e.g. critique promotion (Q65) is always "reviewer-critique", never a
   *  free user choice, so showing an editable selector would be misleading. */
  lockedPrompt?: RecordPrompt;
}) {
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState("");
  const [prompt, setPrompt] = useState<RecordPrompt>(lockedPrompt ?? "internal-review");

  if (!pending) return null;

  const submit = () => {
    onSave({ reason, prompt: lockedPrompt ?? prompt, author });
    setReason("");
    setAuthor("");
    setPrompt(lockedPrompt ?? "internal-review");
  };

  return (
    <div className="record-prompt" data-testid={testId}>
      <p>
        Record why this changed? <strong>{pending.changeSummary}</strong>
      </p>
      {lockedPrompt ? (
        <p className="hint">Prompted by: {PROMPT_LABELS[lockedPrompt]}</p>
      ) : (
        <label className="cond-field">
          <span>Prompted by</span>
          <select
            data-testid={`${testId}-prompt`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value as RecordPrompt)}
          >
            {(Object.keys(PROMPT_LABELS) as RecordPrompt[])
              .filter((p) => p !== "freeze") // set only by the Freeze action itself
              .map((p) => (
                <option key={p} value={p}>
                  {PROMPT_LABELS[p]}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="cond-field">
        <span>Author (name or role)</span>
        <input
          type="text"
          data-testid={`${testId}-author`}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </label>
      <label className="cond-field">
        <span>Reason (required)</span>
        <textarea
          rows={2}
          data-testid={`${testId}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="record-prompt-actions">
        <button
          type="button"
          data-testid={`${testId}-save`}
          disabled={reason.trim() === ""}
          onClick={submit}
        >
          Save record entry
        </button>
        <button type="button" className="secondary" data-testid={`${testId}-dismiss`} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
