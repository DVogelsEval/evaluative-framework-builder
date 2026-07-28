import { useMemo, useState } from "react";
import { canSimulate } from "../domain/simulateGating";
import { foldFramework, type SessionInputs } from "../domain/simulateEvaluate";
import type { ComparisonValue } from "../domain/schema";
import { useStore } from "../store/store";
import { EvidenceValueInputs } from "./EvidenceValueInputs";
import { SimulateFlowMap } from "./SimulateFlowMap";

/**
 * Simulate Judgement window (Slice 14, owner Q60/Q61) — a sister view to the
 * Home Window that folds **hypothetical, throwaway** evidence values up through
 * the Slice-13 conditions to preview how the framework resolves. Every value
 * here is ephemeral: it lives in this component's state, is never written to the
 * document, autosave, or any export, and the window opens blank every time
 * (R-SIM-7). A persistent banner marks every screen as test-only. If the
 * framework stops qualifying while open, the gate message replaces the sandbox.
 */
export function SimulateJudgementView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  // Ephemeral test values — component state only, never the document store.
  const [inputs, setInputs] = useState<SessionInputs>({});

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
        evaluation. Nothing you enter here is saved or exported.
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
        </div>
      )}
    </section>
  );
}
