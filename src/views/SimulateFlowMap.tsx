import { findColumnInAnyLayer, subordinateLayer, superiorLayer, synthesisLayer } from "../domain/layers";
import type { NodeConclusionResult, SimulateResult } from "../domain/simulateEvaluate";
import type { EvaluationQuestion, MesoLayer } from "../domain/schema";
import { ConditionFireDisplay } from "./ConditionFireDisplay";

/**
 * The Simulate fold-up display (R-SIM-6): the framework as tiers — evidence
 * conclusions at the bottom, rolling up through any superior layer to the
 * simulated Overall Judgement on top — each node showing its resulting
 * conclusion (or no-match / ambiguous / unknown) under the current test values.
 * The condition that fired is available read-only beneath each resolved node
 * (reusing the Slice-13 token renderer). Mirrors the Home Map's tier order; a
 * clear panel rather than the SVG so every conclusion is readable and testable.
 */
export function SimulateFlowMap({
  doc,
  result,
}: {
  doc: EvaluationQuestion;
  result: SimulateResult;
}) {
  const subordinate = subordinateLayer(doc);
  const superior = superiorLayer(doc);
  const judgement = doc.overallJudgement;

  const columnLabel = (columnId: string | undefined): string =>
    (columnId ? findColumnInAnyLayer(doc, columnId)?.label : undefined) || "(unnamed)";
  const judgementColumnLabel = (columnId: string | undefined): string =>
    (columnId
      ? judgement?.continuum.columns.find((c) => c.id === columnId)?.label
      : undefined) || "(unnamed)";

  return (
    <div className="sim-flow" data-testid="sim-flow">
      {judgement && (
        <section className="sim-tier sim-tier-judgement">
          <h3>Overall Judgement — SIMULATED</h3>
          <ConclusionCard
            testId="sim-overall"
            title="Overall Judgement"
            result={result.overall ?? { status: "no_conditions" }}
            columnLabel={judgementColumnLabel}
            simulatedTag
          />
        </section>
      )}

      {superior && (
        <LayerTier
          layer={superior}
          result={result}
          columnLabel={columnLabel}
          testIdPrefix="sim-superior"
          heading={superior.kind === "criteria" ? "Higher criteria" : "Components"}
        />
      )}

      {subordinate && (
        <LayerTier
          layer={subordinate}
          result={result}
          columnLabel={columnLabel}
          testIdPrefix="sim-node"
          heading={subordinate.kind === "criteria" ? "Criteria" : "Components"}
        />
      )}

      {judgement && synthesisLayer(doc) && (result.overall?.status ?? "no_conditions") === "no_conditions" && (
        <p className="hint" data-testid="sim-overall-prose-note">
          The Overall Judgement has no Boolean conditions, so it isn&apos;t folded here —
          it&apos;s authored as prose. Add conditions in the synthesis step to simulate it.
        </p>
      )}
    </div>
  );
}

function LayerTier({
  layer,
  result,
  columnLabel,
  testIdPrefix,
  heading,
}: {
  layer: MesoLayer;
  result: SimulateResult;
  columnLabel: (id: string | undefined) => string;
  testIdPrefix: string;
  heading: string;
}) {
  return (
    <section className="sim-tier">
      <h3>{heading}</h3>
      <div className="sim-tier-cards">
        {[...layer.nodes]
          .sort((a, b) => a.order - b.order)
          .map((node) => (
            <ConclusionCard
              key={node.id}
              testId={`${testIdPrefix}-${node.order}`}
              title={node.name || "(unnamed)"}
              result={result.byNode[node.id] ?? { status: "no_conditions" }}
              columnLabel={columnLabel}
            />
          ))}
      </div>
    </section>
  );
}

function ConclusionCard({
  testId,
  title,
  result,
  columnLabel,
  simulatedTag,
}: {
  testId: string;
  title: string;
  result: NodeConclusionResult;
  columnLabel: (id: string | undefined) => string;
  simulatedTag?: boolean;
}) {
  const text = conclusionText(result, columnLabel);
  return (
    <div className={`sim-card sim-card-${result.status}`} data-testid={testId}>
      <div className="sim-card-title">{title}</div>
      <div className="sim-card-conclusion" data-testid={`${testId}-status`}>
        {simulatedTag && <span className="sim-tag">SIMULATED</span>} {text}
      </div>
      {result.status === "resolved" && result.firedCondition && (
        <details className="sim-card-why">
          <summary>Which condition fired?</summary>
          <ConditionFireDisplay condition={result.firedCondition} testId={`${testId}-fired`} />
        </details>
      )}
    </div>
  );
}

/** Human-readable conclusion for a node result (R-SIM-4/5/6). */
function conclusionText(
  result: NodeConclusionResult,
  columnLabel: (id: string | undefined) => string,
): string {
  switch (result.status) {
    case "resolved":
      return columnLabel(result.columnId);
    case "ambiguous":
      return `Conditions overlap — ${(result.satisfiedColumnIds ?? [])
        .map((id) => `“${columnLabel(id)}”`)
        .join(" and ")} are both satisfied (tighten these conditions)`;
    case "unknown":
      return `Cannot determine (missing: ${
        (result.missingElementLabels ?? []).join(", ") || "a value"
      })`;
    case "no_match":
      return "No conclusion — no condition matched these values";
    case "no_conditions":
      return "Authored as prose — not simulated";
  }
}
