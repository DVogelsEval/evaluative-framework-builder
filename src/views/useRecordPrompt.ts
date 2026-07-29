import { useState } from "react";
import type { RecordPrompt } from "../domain/schema";
import { useStore } from "../store/store";

/**
 * V2 record layer capture (docs/ROADMAP-V2.md §1.3, Q64): a dismissible,
 * NEVER-BLOCKING "record why this changed" prompt offered by a view after it
 * calls a mutating store action — the store itself never opens a prompt and
 * never writes a record automatically. That distinction is the whole point of
 * this layer: reasoned changes only, never an auto-logged edit history
 * (extension spec §4.2 — "keystroke noise guarantees the record is unread").
 *
 * A view calls `offer(...)` right after the load-bearing mutation it wants to
 * cover; the returned `pending` state feeds `<RecordPromptBanner>`, which the
 * view renders inline. Dismissing loses nothing but the prompt itself — the
 * mutation already happened.
 */
export interface PendingRecordPrompt {
  elementRef: string;
  changeSummary: string;
  previousValue?: string;
  newValue?: string;
}

export function useRecordPrompt() {
  const addRecordEntry = useStore((s) => s.addRecordEntry);
  const [pending, setPending] = useState<PendingRecordPrompt | null>(null);

  const offer = (prompt: PendingRecordPrompt) => setPending(prompt);
  const dismiss = () => setPending(null);

  const save = (fields: { reason: string; prompt: RecordPrompt; author: string }) => {
    if (!pending || fields.reason.trim() === "") return;
    addRecordEntry({ ...pending, ...fields });
    setPending(null);
  };

  return { pending, offer, dismiss, save };
}
