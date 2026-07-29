import { includedRecordEntries, recordWithheldLine, toMarkdown } from "./output";
import { labelForRef } from "./recordRef";
import type { EvaluationQuestion, RecordEntry } from "./schema";

/**
 * "State as at [date]" export (extension spec §6, docs/ROADMAP-V2.md §3.3): in
 * developmental evaluation the delta since the last export IS the finding,
 * not a secondary artefact — so this leads with what changed, then shows the
 * framework as it currently stands. Deltas are derived entirely from
 * RecordEntry timestamps; there is no new snapshot storage. The "previous
 * export" marker is itself a RecordEntry (`prompt: "other"`, `changeSummary:
 * "State-as-at export"`) written by the caller AFTER the download — so the
 * app stores no separate export log, and this export never lists itself.
 */
export const STATE_AS_AT_MARKER_SUMMARY = "State-as-at export";

/** The most recent previous State-as-at export marker, if any. */
export function previousStateAsAtMarker(doc: EvaluationQuestion): RecordEntry | undefined {
  return [...doc.records]
    .filter((r) => r.prompt === "other" && r.changeSummary === STATE_AS_AT_MARKER_SUMMARY)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))[0];
}

/**
 * Every RecordEntry since the previous marker (exclusive), newest first —
 * including withheld ones, so `recordWithheldLine` can still count them
 * (Phase 1.4's unsuppressible line applies to this window too).
 */
export function recordsSinceLastExport(doc: EvaluationQuestion): RecordEntry[] {
  const marker = previousStateAsAtMarker(doc);
  return doc.records
    .filter((r) => r.id !== marker?.id && (!marker || r.timestamp > marker.timestamp))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}

function mdLine(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

export function buildStateAsAtMarkdown(doc: EvaluationQuestion): string {
  const out: string[] = [];
  const p = (line = "") => out.push(line);
  const generatedAt = new Date().toISOString();
  const marker = previousStateAsAtMarker(doc);
  const windowRecords = recordsSinceLastExport(doc);
  const included = includedRecordEntries(windowRecords);

  p(`# State as at ${generatedAt.slice(0, 10)} — ${doc.title || "Evaluation Question"}`);
  p();
  p(
    marker
      ? `Deltas since the previous State-as-at export (${marker.timestamp.slice(0, 10)}).`
      : `Deltas since this Evaluation Question began — no previous State-as-at export.`,
  );
  p();
  p(`## What changed`);
  p();
  p(`**${recordWithheldLine(windowRecords)}**`);
  p();
  if (included.length === 0) {
    p(`_Nothing recorded in this window._`);
  } else {
    for (const entry of included) {
      const when = entry.timestamp.slice(0, 10);
      const who = entry.author.trim() !== "" ? entry.author.trim() : "(unattributed)";
      p(
        `- **${when}, ${mdLine(who)} (${entry.prompt}):** ${mdLine(labelForRef(doc, entry.elementRef))} — ${mdLine(entry.changeSummary)}. _Reason:_ ${mdLine(entry.reason)}`,
      );
    }
  }
  p();
  p(`## The framework as it currently stands`);
  p();
  p(toMarkdown(doc, { includeDecisionRecord: false }));

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
