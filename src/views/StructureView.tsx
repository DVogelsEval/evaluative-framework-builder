import { useState } from "react";
import { useStore } from "../store/store";
import { WizardNav } from "./WizardNav";

/**
 * J3: the structuring choice (R-044). Criteria of Merit vs Components of the
 * evaluand — the two paths share one architecture; `kind` only changes the
 * word every later screen uses (R-048/Q15, GWT-3.1). A second meso layer and
 * the subordinate choice arrive in a later slice (R-045/R-046, Q33).
 */
export function StructureView() {
  const doc = useStore((s) => s.doc);
  const setLayerKind = useStore((s) => s.setLayerKind);
  const setView = useStore((s) => s.setView);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer) return null;

  const choose = (kind: "criteria" | "components") => {
    setLayerKind(kind);
    setView("nodes");
  };

  return (
    <section className="panel">
      <h2>How will you structure this framework?</h2>
      <p>
        Build it around <strong>Criteria of Merit</strong> (the qualities that make the
        evaluand good) or around <strong>Components</strong> (its parts, each judged in
        turn). The process is identical either way — only the word changes.
      </p>
      <div className="structure-choices">
        <button
          type="button"
          className="structure-choice"
          data-testid="choose-criteria"
          onClick={() => choose("criteria")}
        >
          <strong>Criteria of Merit</strong>
          <span>
            e.g. teaching quality, accessibility, value for stakeholders — qualities the
            whole evaluand is judged by.
          </span>
        </button>
        <button
          type="button"
          className="structure-choice"
          data-testid="choose-components"
          onClick={() => choose("components")}
        >
          <strong>Components</strong>
          <span>
            e.g. the curriculum, the staff, the facilities — parts of the evaluand, each
            judged separately.
          </span>
        </button>
      </div>
      <p className="hint">
        You can add the other layer later — a criteria framework can grow components
        above it, and vice versa.
      </p>
      <WizardNav
        continueTestId="structure-continue"
        onContinue={() => {
          // The choice buttons above advance on first visit; Continue lets a
          // revisit pass through once the choice has been acted on (nodes exist).
          if (layer.nodes.length === 0) {
            setGateMessage("Choose a structure first — click one of the two options.");
            return;
          }
          setGateMessage(null);
          setView("nodes");
        }}
      />
      {gateMessage && (
        <p role="alert" className="error">
          {gateMessage}
        </p>
      )}
    </section>
  );
}
