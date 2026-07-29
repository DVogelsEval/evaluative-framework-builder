import { entriesForRef } from "../domain/recordRef";
import type { EvaluationQuestion } from "../domain/schema";

/**
 * The inline, collapsible "element history" strip (docs/ROADMAP-V2.md §1.5):
 * on any load-bearing element, its RecordEntry history newest-first. Renders
 * nothing when there is none — an element nobody has revised yet shouldn't
 * carry an empty, cluttering "History (0)" toggle.
 */
export function ElementHistory({
  doc,
  elementRef,
  testId,
}: {
  doc: EvaluationQuestion;
  elementRef: string;
  testId: string;
}) {
  const entries = entriesForRef(doc, elementRef);
  if (entries.length === 0) return null;

  return (
    <details className="element-history" data-testid={testId}>
      <summary>History ({entries.length})</summary>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>
              {entry.timestamp.slice(0, 10)}, {entry.author.trim() || "(unattributed)"} (
              {entry.prompt}):
            </strong>{" "}
            {entry.changeSummary} <em>— {entry.reason}</em>
            {!entry.includeInExport && (
              <span className="hint" title="Excluded from exports"> (withheld from export)</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
