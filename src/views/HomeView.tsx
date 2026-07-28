import { useRef, useState } from "react";
import type { MapBox } from "../domain/homeMap";
import { subordinateLayer, superiorLayer } from "../domain/layers";
import { canSimulate } from "../domain/simulateGating";
import { downloadText, saveJsonToDisk, type SaveOutcome } from "../persistence/file";
import { evalqFileName, outputFileName, projectFileName, useStore } from "../store/store";
import { firstIncompleteView, frameworkComplete } from "../store/wizard";
import { HomeMap, mapSvgToPngBlob, serializeMapSvg } from "./HomeMap";

/**
 * Home Window (Slice 9, J13 — R-125–R-130): the Evaluation Question at the top,
 * the framework as a **map-with-lines** — Overall Judgement → meso layer(s) →
 * evidence → sub-method — every box a clickable drill-in (R-125/R-126). Once the
 * framework is complete (Q20) a click opens that tier's editor (R-127); mid-build
 * the window is view-only and any click pulls the user back into the
 * linear-forward wizard at its first incomplete step (R-028, GWT-N1). The map is
 * exportable to SVG/PNG (R-124, closing ⚠Q52). Built conservatively around ⚠Q53
 * — it draws today's behaviour (a superior layer feeds the one judgement) and
 * adds no warning or inter-layer synthesis.
 */
export function HomeView() {
  const doc = useStore((s) => s.doc);
  const project = useStore((s) => s.project);
  const setView = useStore((s) => s.setView);
  const openNodeEditor = useStore((s) => s.openNodeEditor);
  // Per-button save feedback (⚠Q48): saved-in-place vs downloaded fallback.
  const [saveStatus, setSaveStatus] = useState<{ eq?: string; project?: string }>({});
  const [mapStatus, setMapStatus] = useState<string | undefined>();
  const mapSvgRef = useRef<SVGSVGElement>(null);

  if (!doc) return null;

  const statusText = (outcome: SaveOutcome): string | undefined => {
    if (outcome.result === "saved") return `Saved to ${outcome.fileName} ✓`;
    if (outcome.result === "downloaded") {
      return `Downloaded ${outcome.fileName} — this browser can't save in place`;
    }
    return undefined; // cancelled: nothing was saved, say nothing
  };
  const layer = subordinateLayer(doc);
  const superior = superiorLayer(doc);
  const complete = frameworkComplete(doc);
  const resume = () => setView(firstIncompleteView(doc));
  // Simulate Judgement gating (Slice 14, R-SIM-1): the entry point is always
  // shown once the framework is navigable, but disabled — naming the blocking
  // node(s) — until every node uses a conditioned rubric (never hidden silently).
  const gate = canSimulate(doc);

  // Drill into a map box's editor (R-126/R-127). Mid-build any click is pulled
  // back to the wizard's first incomplete step (R-028); once complete, a click
  // opens that tier: judgement → synthesis, superior → second layer, subordinate
  // → its rubric editor, evidence/sub-method → the node's evidence view.
  const drillIn = (box: MapBox) => {
    if (!complete) {
      resume();
      return;
    }
    switch (box.tier) {
      case "judgement":
        setView("synthesis");
        break;
      case "superior":
        setView("secondlayer");
        break;
      case "subordinate":
        openNodeEditor(box.refId);
        break;
      case "evidence":
      case "submethod":
        useStore.setState({ focusNodeId: box.nodeId ?? null });
        setView("evidence");
        break;
    }
  };

  const exportMapSvg = () => {
    if (!mapSvgRef.current) return;
    downloadText(
      outputFileName(`${doc.title}-map`, "svg"),
      serializeMapSvg(mapSvgRef.current),
      "image/svg+xml",
    );
    setMapStatus("Exported map as SVG ✓");
  };
  const exportMapPng = async () => {
    if (!mapSvgRef.current) return;
    try {
      const blob = await mapSvgToPngBlob(mapSvgRef.current);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = outputFileName(`${doc.title}-map`, "png");
      anchor.click();
      URL.revokeObjectURL(url);
      setMapStatus("Exported map as PNG ✓");
    } catch {
      setMapStatus("Couldn't render the PNG in this browser — SVG export still works");
    }
  };

  return (
    <section className="panel" data-testid="home-window">
      <h2>Home Window</h2>
      {!complete && (
        <div className="resume-banner" data-testid="resume-banner">
          <span>
            This framework is still being built — you can view progress here, but
            editing continues in the step-by-step process.
          </span>
          <button type="button" data-testid="resume-wizard" onClick={resume}>
            Resume building
          </button>
        </div>
      )}
      <blockquote className="question-banner" data-testid="home-question">
        {doc.questionText}
      </blockquote>

      {layer && layer.nodes.length > 0 && (
        <div className="home-map" data-testid="home-map-container">
          <HomeMap ref={mapSvgRef} doc={doc} onActivate={drillIn} />
          {complete && (
            <div className="home-map-actions no-print">
              <button type="button" className="secondary" data-testid="export-map-svg" onClick={exportMapSvg}>
                Export map (SVG)
              </button>
              <button type="button" className="secondary" data-testid="export-map-png" onClick={exportMapPng}>
                Export map (PNG)
              </button>
              {mapStatus !== undefined && (
                <span className="save-status" data-testid="map-status">
                  {mapStatus}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {complete && !doc.overallJudgement && (
        <button
          type="button"
          className="link-button"
          data-testid="home-add-synthesis"
          onClick={() => setView("synthesis")}
        >
          Make an Overall Judgement (synthesis) after all
        </button>
      )}

      {complete && layer && !superior && (
        <button
          type="button"
          className="link-button"
          data-testid="home-add-second-layer"
          onClick={() => setView("secondlayer")}
        >
          Group these {layer.kind === "criteria" ? "criteria" : "components"} under a
          higher layer (a second meso layer)
        </button>
      )}

      {/* Outputs & exports (J12, ⚠Q50): available once the framework is
          navigable — the Evidence Matrix and rubric plan are of a complete
          framework (GWT-12.1). */}
      {complete && (
        <div className="home-outputs-cta">
          <button
            type="button"
            data-testid="home-outputs"
            onClick={() => setView("outputs")}
          >
            View outputs &amp; exports
          </button>
          <span className="hint">
            Evidence Matrix, rubric plan, and export to PDF, Markdown, CSV or JSON.
          </span>
        </div>
      )}

      {/* Simulate Judgement (Slice 14, R-SIM-1): a design-time sandbox that
          folds hypothetical evidence values up through the Slice-13 conditions.
          Shown once navigable; disabled with reasons until every node qualifies.
          Nothing it does is saved or exported. */}
      {complete && (
        <div className="home-outputs-cta">
          <button
            type="button"
            data-testid="home-simulate"
            disabled={!gate.allowed}
            title={gate.allowed ? undefined : "Every node needs a conditioned rubric first"}
            onClick={() => setView("simulate")}
          >
            Simulate Judgement (test values)
          </button>
          <span className="hint">
            {gate.allowed
              ? "Enter hypothetical evidence levels and see how your framework resolves — nothing is saved."
              : "Available once every node uses a rubric with at least one Boolean condition."}
          </span>
          {!gate.allowed && gate.blockingNodes.length > 0 && (
            <ul className="sim-gate-reasons" data-testid="home-simulate-reasons">
              {gate.blockingNodes.map((b) => (
                <li key={b.nodeId}>{b.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* AI hand-off / prompt-out (Slice 11, R-139; AI-HANDOFF.md). Available
          whenever there's a question to serialise — a critique aid useful while
          building, not only when complete. Copies a prompt OUT; nothing is sent
          or auto-applied. */}
      {doc.questionText.trim() !== "" && (
        <div className="home-outputs-cta">
          <button
            type="button"
            data-testid="home-ai-handoff"
            onClick={() => setView("aihandoff")}
          >
            AI hand-off (copy a prompt)
          </button>
          <span className="hint">
            Compose a prompt about any part of the framework to paste into your own
            AI — nothing is sent from here and nothing is applied automatically.
          </span>
        </div>
      )}

      <div className="save-controls">
        <span className="save-control">
          <button
            type="button"
            data-testid="save-project"
            onClick={async () => {
              // One Save writes the whole Project — every EQ, in one file. The
              // active doc is already folded into the project on each edit.
              const outcome = project
                ? await saveJsonToDisk(project.id, projectFileName(project.name), project)
                : await saveJsonToDisk(doc.id, evalqFileName(doc.title), doc);
              setSaveStatus({ project: statusText(outcome) });
            }}
          >
            Save Project
          </button>
          {saveStatus.project !== undefined && (
            <span className="save-status" data-testid="save-status-project">
              {saveStatus.project}
            </span>
          )}
        </span>
      </div>
      <p className="hint">
        Save writes your whole Project — all its Evaluation Questions — to one
        file, overwriting it in place each time (the browser asks where only on the
        first save). Your work is also autosaved in this browser.
      </p>
      {doc.recycleBin.deletedNodes.length > 0 && (
        <button
          type="button"
          className="link-button"
          data-testid="home-deleted"
          onClick={() => setView("deleted")}
        >
          Deleted items ({doc.recycleBin.deletedNodes.length})
        </button>
      )}
      <button
        type="button"
        className="link-button"
        data-testid="open-different"
        onClick={() => setView("start")}
      >
        Open a different Project or Evaluation Question
      </button>
    </section>
  );
}
