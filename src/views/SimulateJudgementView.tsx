import { useMemo, useState } from "react";
import { checkSimCaseAdvisory } from "../domain/invariants";
import { SIMULATED_LABEL } from "../domain/simCase";
import { canSimulate } from "../domain/simulateGating";
import { foldFramework, type SessionInputs } from "../domain/simulateEvaluate";
import type { ComparisonValue } from "../domain/schema";
import { useStore } from "../store/store";
import { EvidenceValueInputs } from "./EvidenceValueInputs";
import { SimulateFlowMap } from "./SimulateFlowMap";

/**
 * Simulate Judgement window (Slice 14, owner Q60/Q61) — a sister view to the
 * Home Window that folds **hypothetical, throwaway** evidence values up through
 * the Slice-13 conditions to preview how the framework resolves. An ad-hoc
 * session's values are ephemeral: component state only, never written
 * anywhere unless the user explicitly clicks **Save as Case** (V2, Q67 —
 * the one deliberate amendment to R-SIM-7's "never saved"). A saved case is
 * a `SimCase`, labelled SIMULATED everywhere it is later shown, and is a
 * hypothetical the author wrote — never a recorded evaluation result. The
 * window still opens blank every time. A persistent banner marks every
 * screen as test-only. If the framework stops qualifying while open, the
 * gate message replaces the sandbox.
 */
export function SimulateJudgementView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  const addSimCase = useStore((s) => s.addSimCase);
  // Ephemeral test values — component state only, never the document store,
  // UNLESS the user explicitly saves them as a Case (Q67).
  const [inputs, setInputs] = useState<SessionInputs>({});
  const [saveForm, setSaveForm] = useState<{ label: string; prose: string; expectedToFail: boolean } | null>(
    null,
  );

  const gate = useMemo(() => (doc ? canSimulate(doc) : { allowed: false, blockingNodes: [] }), [doc]);
  const result = useMemo(
    () => (doc && gate.allowed ? foldFramework(doc, inputs) : { byNode: {} }),
    [doc, gate.allowed, inputs],
  );

  if (!doc) return null;

  const setInput = (key: string, value: ComparisonValue | undefined) =>
    setInputs((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <section className="panel" data-testid="simulate-window">
      <div className="sim-banner" role="note" data-testid="sim-banner">
        Test values only — not saved, not a recorded evaluation.
      </div>

      <div className="sim-head">
        <h2>Simulate Judgement</h2>
        <div className="sim-actions no-print">
          <button
            type="button"
            className="secondary"
            data-testid="sim-clear"
            onClick={() => setInputs({})}
          >
            Clear all test values
          </button>
          <button type="button" data-testid="sim-exit" onClick={() => setView("home")}>
            Exit to Home
          </button>
        </div>
      </div>

      <p>
        Enter <strong>hypothetical</strong> evidence levels and watch how your framework
        would resolve them — a design-time check on your rubric logic, not a real
        evaluation. Values stay ephemeral unless you explicitly Save as Case below.
      </p>

      {!gate.allowed ? (
        <div className="sim-blocked" role="alert" data-testid="sim-blocked">
          <p>Simulate Judgement isn&apos;t available for this framework yet:</p>
          <ul>
            {gate.blockingNodes.length === 0 ? (
              <li>Build at least one criterion with a conditioned rubric first.</li>
            ) : (
              gate.blockingNodes.map((b) => <li key={b.nodeId}>{b.reason}</li>)
            )}
          </ul>
        </div>
      ) : (
        <div className="sim-body">
          <EvidenceValueInputs doc={doc} inputs={inputs} onChange={setInput} />
          <SimulateFlowMap doc={doc} result={result} />

          {/* V2 Cases (Q62/Q67) — the one deliberate exception to "never
              saved": an explicit, named Save persists the current session
              inputs as a SIMULATED Case for the review loop (Phase 2). */}
          <div className="sim-cases panel-section" data-testid="sim-cases">
            <h3>Cases ({SIMULATED_LABEL})</h3>
            <p className="hint">
              Save the current test values as a named, reusable case for the review loop —
              a hypothetical you author, never a recorded result.
            </p>

            {saveForm ? (
              <div className="record-prompt" data-testid="sim-save-case-form">
                <label className="cond-field">
                  <span>Label</span>
                  <input
                    type="text"
                    data-testid="sim-save-case-label"
                    value={saveForm.label}
                    onChange={(e) => setSaveForm({ ...saveForm, label: e.target.value })}
                  />
                </label>
                <label className="cond-field">
                  <span>Prose (the vignette, plain language)</span>
                  <textarea
                    rows={2}
                    data-testid="sim-save-case-prose"
                    value={saveForm.prose}
                    onChange={(e) => setSaveForm({ ...saveForm, prose: e.target.value })}
                  />
                </label>
                <label className="cond-field record-item-export-toggle">
                  <input
                    type="checkbox"
                    data-testid="sim-save-case-expected-fail"
                    checked={saveForm.expectedToFail}
                    onChange={(e) => setSaveForm({ ...saveForm, expectedToFail: e.target.checked })}
                  />
                  <span>I expect this case to fail the Sufficient Bar</span>
                </label>
                <div className="record-prompt-actions">
                  <button
                    type="button"
                    data-testid="sim-save-case-submit"
                    disabled={saveForm.label.trim() === ""}
                    onClick={() => {
                      const values: Record<string, ComparisonValue> = {};
                      for (const [key, value] of Object.entries(inputs)) {
                        if (value !== undefined) values[key] = value;
                      }
                      addSimCase({
                        label: saveForm.label,
                        prose: saveForm.prose,
                        values,
                        expectedToFail: saveForm.expectedToFail || undefined,
                      });
                      setSaveForm(null);
                    }}
                  >
                    Save as Case
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    data-testid="sim-save-case-cancel"
                    onClick={() => setSaveForm(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="secondary"
                data-testid="sim-save-case-open"
                onClick={() => setSaveForm({ label: "", prose: "", expectedToFail: false })}
              >
                + Save current test values as a Case
              </button>
            )}

            {doc.simCases.length > 0 && (
              <>
                <h4>Load a saved case</h4>
                <ul className="sim-case-list">
                  {doc.simCases.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="secondary"
                        data-testid={`sim-load-case-${c.id}`}
                        onClick={() => setInputs(c.values)}
                      >
                        {c.label || "(unnamed case)"}
                      </button>
                      {c.expectedToFail && <span className="hint"> (expected to fail)</span>}
                    </li>
                  ))}
                </ul>
                {checkSimCaseAdvisory(doc).map((issue) => (
                  <p className="warning" key={issue.message} data-testid="sim-case-advisory">
                    ⚠ {issue.message}
                  </p>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
