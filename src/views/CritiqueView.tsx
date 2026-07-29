import { useState } from "react";
import { findColumnInAnyLayer } from "../domain/layers";
import { refForSimCase } from "../domain/recordRef";
import { frameworkPlacementForCase } from "../domain/simCaseFold";
import { useStore } from "../store/store";
import { RecordPromptBanner } from "./RecordPromptBanner";
import { useRecordPrompt } from "./useRecordPrompt";

/**
 * Critique import (V2 Phase 2.4, extension spec §5.4): import one or more
 * reviewer critique files (downloaded from the review artefact, Phase 2.3)
 * and show, per Case, each reviewer's placement against the framework's own
 * — disagreements first. Multiple reviewers sit SIDE BY SIDE; they are never
 * aggregated, averaged, or vote-counted (extension spec decision 9).
 * Promoting a disagreement to the Decision record is an explicit act
 * requiring a reason — never automatic (reuses the Phase 1 record-prompt
 * banner exactly as ContinuumView/NodesView do).
 */
export function CritiqueView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  const importCritique = useStore((s) => s.importCritique);
  const removeCritique = useStore((s) => s.removeCritique);
  const [importStatus, setImportStatus] = useState<string | undefined>();
  const recordPrompt = useRecordPrompt();

  if (!doc) return null;

  const columnLabel = (columnId: string) => findColumnInAnyLayer(doc, columnId)?.label || "(unnamed level)";

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const results: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const raw: unknown = JSON.parse(text);
        const outcome = importCritique(raw);
        results.push(outcome.success ? `Imported "${file.name}".` : `${file.name}: ${outcome.error}`);
      } catch {
        results.push(`${file.name}: not a valid JSON file.`);
      }
    }
    setImportStatus(results.join(" "));
  };

  // Disagreements first, within each critique (extension spec §5.4).
  const rowsFor = (critique: (typeof doc.critiques)[number]) =>
    [...critique.placements]
      .map((placement) => {
        const simCase = doc.simCases.find((c) => c.id === placement.simCaseId);
        const frameworkColumnId = simCase ? frameworkPlacementForCase(doc, simCase) : null;
        const agree = frameworkColumnId !== null && frameworkColumnId === placement.placedAtColumnId;
        return { placement, simCase, frameworkColumnId, agree };
      })
      .sort((a, b) => Number(a.agree) - Number(b.agree));

  return (
    <section className="panel" data-testid="critique-view">
      <h2>Critique import</h2>
      <p className="hint">
        Import a critique file downloaded from the review artefact. Reviewers are shown side by
        side — never averaged, combined, or vote-counted.
      </p>

      <label className="cond-field">
        <span>Import critique file(s)</span>
        <input
          type="file"
          accept="application/json"
          multiple
          data-testid="critique-file-input"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {importStatus !== undefined && (
        <p role="status" data-testid="critique-import-status">
          {importStatus}
        </p>
      )}

      {doc.critiques.length === 0 ? (
        <p data-testid="critique-empty">No critiques imported yet.</p>
      ) : (
        doc.critiques.map((critique) => (
          <div key={critique.id} className="panel-section" data-testid={`critique-${critique.id}`}>
            <h3>{critique.reviewerLabel || "(unlabelled reviewer)"}</h3>
            <p className="hint">Imported {critique.importedAt.slice(0, 10)}</p>
            <table className="output-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Reviewer placed at</th>
                  <th>Framework placed at</th>
                  <th>Agree?</th>
                  <th>Objection</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rowsFor(critique).map(({ placement, simCase, frameworkColumnId, agree }) => (
                  <tr key={placement.simCaseId}>
                    <td>{simCase?.label ?? "(case not found)"}</td>
                    <td>{columnLabel(placement.placedAtColumnId)}</td>
                    <td>{frameworkColumnId ? columnLabel(frameworkColumnId) : "(not resolvable)"}</td>
                    <td>{frameworkColumnId ? (agree ? "Agree" : "Disagree") : "—"}</td>
                    <td>{placement.objection ?? ""}</td>
                    <td>
                      {!agree && frameworkColumnId && simCase && (
                        <button
                          type="button"
                          className="secondary"
                          data-testid={`promote-${critique.id}-${placement.simCaseId}`}
                          onClick={() =>
                            recordPrompt.offer({
                              elementRef: refForSimCase(simCase.id),
                              changeSummary: `${critique.reviewerLabel || "A reviewer"} disagreed on "${simCase.label}": placed at "${columnLabel(placement.placedAtColumnId)}", framework placed it at "${columnLabel(frameworkColumnId)}".`,
                            })
                          }
                        >
                          Promote to record
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {critique.addedCases.length > 0 && (
                  <tr>
                    <td colSpan={6}>
                      <strong>Reviewer-added cases:</strong>{" "}
                      {critique.addedCases.map((c) => c.label || "(untitled)").join(", ")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <button
              type="button"
              className="chip-remove"
              data-testid={`remove-critique-${critique.id}`}
              title="Remove (moves to the Recycle Bin)"
              onClick={() => removeCritique(critique.id)}
            >
              ×
            </button>
          </div>
        ))
      )}

      <RecordPromptBanner
        pending={recordPrompt.pending}
        onSave={recordPrompt.save}
        onDismiss={recordPrompt.dismiss}
        testId="critique-record-prompt"
        lockedPrompt="reviewer-critique"
      />

      <button
        type="button"
        className="secondary"
        data-testid="critique-back-home"
        onClick={() => setView("home")}
      >
        ← Home Window
      </button>
    </section>
  );
}
