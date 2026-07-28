import { Fragment, useState } from "react";
import { findColumnInAnyLayer } from "../domain/layers";
import {
  clarityNotes,
  columnsByBar,
  evidenceMatrix,
  justificationsByCriterion,
  matrixToCsv,
  methodOutputLabel,
  orderedNodesForOutput,
  toMarkdown,
} from "../domain/output";
import { scenarioPlainText } from "../domain/scenario";
import type { Cell, Column, Continuum, EvaluationQuestion, MesoLayer, MesoNode } from "../domain/schema";
import { downloadText, saveJsonToDisk } from "../persistence/file";
import { evalqFileName, outputFileName, useStore } from "../store/store";

/**
 * J12 — Outputs & exports (Slice 8, R-115–R-124, Q21/Q26/Q51). Two derived
 * printouts (SPEC §7 — views, not entities): **Output A** the Evidence Matrix +
 * a criterion-first justifications page (R-116/R-117, Q51 note 1), and
 * **Output B** the full rubric plan (R-119–R-123) with the Sufficient Bar drawn
 * in every rubric (Q51 note 2) and a per-view horizontal/vertical layout toggle
 * (Q51 note 3). Reached from the Home Window once the framework is navigable
 * (⚠Q50). The page itself is the *clean viewable* output — the browser's
 * print-to-PDF over the print stylesheet (Q21). Export buttons produce the
 * *editable* Markdown (Q21), the Evidence Matrix CSV (R-118), and the whole EQ
 * as JSON (R-124). All client-side, no backend (Arch §3). The synthesis-visual
 * SVG/PNG export lives on the Home map (Slice 9, closing ⚠Q52).
 */

/** How Output B lays each rubric out — a display preference, not document state
 *  (Q51 note 3): "vertical" stacks conclusions in rows (the familiar
 *  step-by-step view), "horizontal" runs them across columns (the classic
 *  rubric, the Sufficient Bar a vertical divider). It's a single global toggle
 *  for the whole printout — one setting matches how a user prints the sheet. */
type RubricLayout = "vertical" | "horizontal";

export function OutputsView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);
  const [layout, setLayout] = useState<RubricLayout>("vertical");
  if (!doc) return null;

  const matrix = evidenceMatrix(doc);
  const groups = justificationsByCriterion(doc);
  const notes = clarityNotes(doc);
  const outputNodes = orderedNodesForOutput(doc);
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  // All meso nodes across both layers — a superior node's inter-layer scenario
  // tokens name subordinate nodes (Q54), so the per-node resolver must resolve
  // node ids as well as method ids.
  const nodeById = new Map(doc.mesoLayers.flatMap((l) => l.nodes).map((n) => [n.id, n]));
  const judgement = doc.overallJudgement;

  const exportMarkdown = () =>
    downloadText(outputFileName(doc.title, "md"), toMarkdown(doc), "text/markdown");
  const exportCsv = () =>
    downloadText(outputFileName(doc.title, "csv"), matrixToCsv(matrix), "text/csv");
  const exportJson = () =>
    void saveJsonToDisk(doc.id, evalqFileName(doc.title), doc);

  return (
    <section className="panel outputs-view" data-testid="outputs-view">
      <div className="outputs-toolbar no-print">
        <h2>Outputs &amp; exports</h2>
        <div className="outputs-actions">
          <button type="button" data-testid="export-print" onClick={() => window.print()}>
            Print / save as PDF
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="export-markdown"
            onClick={exportMarkdown}
          >
            Export Markdown (editable)
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="export-csv"
            onClick={exportCsv}
          >
            Export matrix CSV
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="export-json"
            onClick={exportJson}
          >
            Export whole EQ (JSON)
          </button>
          <button
            type="button"
            className="secondary"
            data-testid="outputs-back-home"
            onClick={() => setView("home")}
          >
            ← Home Window
          </button>
        </div>
        <div className="output-layout-toggle" role="group" aria-label="Output B rubric layout">
          <span className="hint">Output B rubric layout:</span>
          <button
            type="button"
            className={layout === "vertical" ? "" : "secondary"}
            aria-pressed={layout === "vertical"}
            data-testid="layout-vertical"
            onClick={() => setLayout("vertical")}
          >
            Vertical (conclusions in rows)
          </button>
          <button
            type="button"
            className={layout === "horizontal" ? "" : "secondary"}
            aria-pressed={layout === "horizontal"}
            data-testid="layout-horizontal"
            onClick={() => setLayout("horizontal")}
          >
            Horizontal (conclusions in columns)
          </button>
        </div>
        <p className="hint">
          This page is the clean, viewable output — use “Print / save as PDF” for a
          shareable copy. The synthesis map graphic and its SVG/PNG export live on the
          Home Window.
        </p>
      </div>

      <div className="output-sheet" data-testid="output-sheet">
        {/* ---- Output A: Evidence Matrix (R-116, GWT-12.1/12.2) ------------- */}
        <h1 className="output-title">{doc.title}</h1>
        {doc.questionText.trim() !== "" && (
          <blockquote className="question-banner">{doc.questionText}</blockquote>
        )}

        <h2>Output A — Evidence Matrix</h2>
        {matrix.rows.length === 0 ? (
          <p className="hint">No Evidence / Methods have been added yet.</p>
        ) : (
          <table className="output-table" data-testid="evidence-matrix">
            <thead>
              <tr>
                <th>Evidence / Method</th>
                <th>Process</th>
                {matrix.columns.map((c) => (
                  <th key={c.nodeId} className="matrix-node-head">
                    {c.name || "(unnamed)"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{row.process}</td>
                  {matrix.columns.map((c) => (
                    <td key={c.nodeId} className="matrix-mark">
                      {row.markedNodeIds.includes(c.nodeId) ? "✕" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ---- Output A page 2: justifications, criterion-first (R-117, Q51) - */}
        {groups.length > 0 && (
          <div className="output-page" data-testid="justifications">
            <h3>Evidence justifications</h3>
            <p className="hint">
              Each criterion spans all of its Evidence/Methods — with how it links to
              the Evaluation Question, to values, its intended use, and any
              sub-methods note.
            </p>
            <table
              className="output-table justifications-table"
              data-testid="justifications-table"
            >
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th>Evidence / Method</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const rows = g.entries.length > 0 ? g.entries : [null];
                  return (
                    <Fragment key={g.nodeId}>
                      {rows.map((entry, i) => (
                        <tr key={`${g.nodeId}-${i}`}>
                          {i === 0 && (
                            <th
                              scope="rowgroup"
                              rowSpan={rows.length}
                              className="justif-criterion"
                            >
                              <span className="justif-criterion-name">
                                {g.nodeName || "(unnamed)"}
                              </span>
                              <dl className="justif-warrants">
                                {g.linkToQuestion.trim() !== "" && (
                                  <>
                                    <dt>Links to the Evaluation Question</dt>
                                    <dd>{g.linkToQuestion}</dd>
                                  </>
                                )}
                                {g.linkToValues.trim() !== "" && (
                                  <>
                                    <dt>Links to values</dt>
                                    <dd>{g.linkToValues}</dd>
                                  </>
                                )}
                                {g.decisionsOrUse.trim() !== "" && (
                                  <>
                                    <dt>Decisions or use</dt>
                                    <dd>{g.decisionsOrUse}</dd>
                                  </>
                                )}
                                {g.subMethodsNote.trim() !== "" && (
                                  <>
                                    <dt>Sub-methods note</dt>
                                    <dd>{g.subMethodsNote}</dd>
                                  </>
                                )}
                              </dl>
                            </th>
                          )}
                          {entry ? (
                            <>
                              <td>
                                {entry.methodLabel}
                                {entry.mixedStrategy && (
                                  <span className="justif-strategy">
                                    {" "}
                                    — {entry.mixedStrategy}
                                  </span>
                                )}
                              </td>
                              <td>{entry.justification}</td>
                            </>
                          ) : (
                            <td colSpan={2} className="hint">
                              No Evidence/Methods linked.
                            </td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Output B: rubric plan (R-119–R-123, GWT-12.4) --------------- */}
        <div className="output-page" data-testid="output-b">
          <h2>Output B — Rubric plan</h2>

          {judgement && <SynthesisSummary doc={doc} layout={layout} />}

          {outputNodes.map(({ layer, node }) => {
            // Subordinate node scenarios reference methods; superior node
            // inter-layer scenarios reference subordinate nodes (Q54). Resolve
            // both, and columns against the owning layer (Q53 reading point 2).
            const nameFor = (id: string) =>
              methodById.get(id)?.name ?? nodeById.get(id)?.name ?? "(unnamed)";
            const columnLabelFor = (id: string) =>
              findColumnInAnyLayer(doc, id)?.label ?? "(column)";
            const tier = node.evidenceTier;
            return (
              <div key={node.id} className="output-node" data-testid={`output-node-${node.id}`}>
                <h3>
                  <span className="output-kind">
                    {layer.kind === "criteria" ? "Criterion" : "Component"}
                  </span>{" "}
                  {node.name || "(unnamed)"}
                </h3>
                <RubricPlanTable
                  layer={layer}
                  node={node}
                  layout={layout}
                  nameFor={nameFor}
                  columnLabelFor={columnLabelFor}
                />

                {tier?.shape === "list" && (
                  <div className="output-tier">
                    <h4>Evidence plan (data description list)</h4>
                    <ul>
                      {tier.entries.map((entry, i) => (
                        <li key={i}>
                          <strong>
                            {entry.evidenceMethodId
                              ? nameFor(entry.evidenceMethodId)
                              : "(no specific method)"}
                            :
                          </strong>{" "}
                          {entry.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tier?.shape === "rubric" && (
                  <div className="output-tier">
                    <h4>Evidence-tier rubric</h4>
                    <RubricTierTable
                      doc={doc}
                      node={node}
                      continuum={tier.continuum}
                      cells={tier.methodLevelCells}
                      layout={layout}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {notes.length > 0 && (
            <div className="output-page" data-testid="clarity-notes">
              <h3>Clarity notes</h3>
              <p className="hint">
                Conclusions flagged as possibly not clearly evidenced (R-096):
              </p>
              <ul>
                {notes.map((n, i) => (
                  <li key={i}>
                    <strong>
                      {n.nodeName} — {n.columnLabel}:
                    </strong>{" "}
                    {n.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The scenario prose beneath a conclusion, one line per described scenario. */
function ScenarioList({
  scenarios,
  nameFor,
  columnLabelFor,
}: {
  scenarios: Cell["scenarios"];
  nameFor: (id: string) => string;
  columnLabelFor: (id: string) => string;
}) {
  return (
    <>
      {[...scenarios]
        .sort((a, b) => a.order - b.order)
        .map((s) => scenarioPlainText(s.parts, nameFor, columnLabelFor))
        .filter((t) => t.trim() !== "")
        .map((t, i) => (
          <div key={i} className="output-scenario">
            {t}
          </div>
        ))}
    </>
  );
}

/**
 * A meso node's rubric row rendered for Output B, with the Sufficient Bar drawn
 * between the below- and above-bar conclusions (Q51 note 2) in whichever layout
 * the user picked (Q51 note 3): "vertical" = conclusions in rows (bar = a
 * divider row); "horizontal" = conclusions in columns (bar = a divider column).
 * Only *included* conclusions are shown (matching the mid-build editors).
 */
function RubricPlanTable({
  layer,
  node,
  layout,
  nameFor,
  columnLabelFor,
}: {
  layer: MesoLayer;
  node: MesoNode;
  layout: RubricLayout;
  nameFor: (id: string) => string;
  columnLabelFor: (id: string) => string;
}) {
  const cellFor = (col: Column) => node.cells.find((c) => c.columnId === col.id);
  const { below, above } = columnsByBar(
    layer.continuum,
    (col) => cellFor(col)?.included ?? false,
  );
  const showBar = below.length > 0 && above.length > 0;

  if (layout === "horizontal") {
    return (
      <table className="output-table rubric-columns">
        <thead>
          <tr>
            <th className="rubric-corner" />
            {below.map((col) => (
              <th key={col.id}>{col.label || "(unnamed)"}</th>
            ))}
            {showBar && (
              <th
                className="sufficient-bar-col-head"
                data-testid="output-sufficient-bar"
                title="Sufficient Bar"
                aria-label="Sufficient Bar"
              />
            )}
            {above.map((col) => (
              <th key={col.id}>{col.label || "(unnamed)"}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Plain description</th>
            {below.map((col) => (
              <td key={col.id}>{cellFor(col)?.plainDescription ?? ""}</td>
            ))}
            {showBar && <td className="sufficient-bar-col" />}
            {above.map((col) => (
              <td key={col.id}>{cellFor(col)?.plainDescription ?? ""}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Scenarios (evidence conditions)</th>
            {below.map((col) => (
              <td key={col.id}>
                <ScenarioList
                  scenarios={cellFor(col)?.scenarios ?? []}
                  nameFor={nameFor}
                  columnLabelFor={columnLabelFor}
                />
              </td>
            ))}
            {showBar && <td className="sufficient-bar-col" />}
            {above.map((col) => (
              <td key={col.id}>
                <ScenarioList
                  scenarios={cellFor(col)?.scenarios ?? []}
                  nameFor={nameFor}
                  columnLabelFor={columnLabelFor}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    );
  }

  const conclusionRow = (col: Column) => (
    <tr key={col.id}>
      <th scope="row">{col.label || "(unnamed)"}</th>
      <td>{cellFor(col)?.plainDescription ?? ""}</td>
      <td>
        <ScenarioList
          scenarios={cellFor(col)?.scenarios ?? []}
          nameFor={nameFor}
          columnLabelFor={columnLabelFor}
        />
      </td>
    </tr>
  );

  return (
    <table className="output-table">
      <thead>
        <tr>
          <th>Conclusion</th>
          <th>Plain description</th>
          <th>Scenarios (evidence conditions)</th>
        </tr>
      </thead>
      <tbody>
        {/* Vertical reads top-to-bottom like a ladder: positive (above-bar) on
            top, negative (below-bar) at the bottom (sense-checked against the
            horizontal layout's negative-left/positive-right convention, which
            stays as built). */}
        {above.map(conclusionRow)}
        {showBar && <BarRow colSpan={3} />}
        {below.map(conclusionRow)}
      </tbody>
    </table>
  );
}

/** A full-width Sufficient Bar divider row for the vertical rubric layout. */
function BarRow({ colSpan }: { colSpan: number }) {
  return (
    <tr className="sufficient-bar-row" data-testid="output-sufficient-bar">
      <td colSpan={colSpan} className="sufficient-bar-cell">
        Sufficient Bar
      </td>
    </tr>
  );
}

/** The synthesis rubric rendered read-only for Output B (R-120/R-121), with the
 *  Sufficient Bar and the same horizontal/vertical layout toggle. */
function SynthesisSummary({
  doc,
  layout,
}: {
  doc: EvaluationQuestion;
  layout: RubricLayout;
}) {
  const judgement = doc.overallJudgement;
  if (!judgement) return null;
  const nameFor = (id: string) =>
    doc.mesoLayers.flatMap((l) => l.nodes).find((n) => n.id === id)?.name ?? "(unnamed)";
  // A synthesis token's `atColumnId` is a column of a meso layer (the clicked
  // meso-rubric cell). Both layers feed the judgement now (Q53), so resolve
  // against whichever layer owns the column, not just `synthesisLayer()`.
  const columnLabelFor = (id: string) =>
    findColumnInAnyLayer(doc, id)?.label ?? "(column)";

  if ((judgement.freeTextOverride ?? "").trim() !== "") {
    return (
      <div className="output-synthesis" data-testid="output-synthesis">
        <h3>Overall Judgement</h3>
        <p className="output-freetext">{judgement.freeTextOverride}</p>
      </div>
    );
  }

  const { below, above } = columnsByBar(judgement.continuum);
  const showBar = below.length > 0 && above.length > 0;
  const decision = judgement.decisionRowEnabled;
  const decisionText = (col: Column) =>
    judgement.decisionCells.find((c) => c.columnId === col.id)?.text ?? "";
  const plainText = (col: Column) =>
    judgement.plainDescriptionCells.find((c) => c.columnId === col.id)?.text ?? "";
  const conditions = (col: Column) => (
    <ScenarioList
      scenarios={judgement.scenarios.filter((s) => s.yieldsColumnId === col.id)}
      nameFor={nameFor}
      columnLabelFor={columnLabelFor}
    />
  );

  if (layout === "horizontal") {
    return (
      <div className="output-synthesis" data-testid="output-synthesis">
        <h3>Overall Judgement</h3>
        <table className="output-table rubric-columns">
          <thead>
            <tr>
              <th className="rubric-corner" />
              {below.map((col) => (
                <th key={col.id}>{col.label || "(unnamed)"}</th>
              ))}
              {showBar && (
                <th
                  className="sufficient-bar-col-head"
                  data-testid="output-sufficient-bar"
                  title="Sufficient Bar"
                  aria-label="Sufficient Bar"
                />
              )}
              {above.map((col) => (
                <th key={col.id}>{col.label || "(unnamed)"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decision && (
              <tr>
                <th scope="row">Decision</th>
                {below.map((col) => (
                  <td key={col.id}>{decisionText(col)}</td>
                ))}
                {showBar && <td className="sufficient-bar-col" />}
                {above.map((col) => (
                  <td key={col.id}>{decisionText(col)}</td>
                ))}
              </tr>
            )}
            <tr>
              <th scope="row">Plain description</th>
              {below.map((col) => (
                <td key={col.id}>{plainText(col)}</td>
              ))}
              {showBar && <td className="sufficient-bar-col" />}
              {above.map((col) => (
                <td key={col.id}>{plainText(col)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Criterion conditions</th>
              {below.map((col) => (
                <td key={col.id}>{conditions(col)}</td>
              ))}
              {showBar && <td className="sufficient-bar-col" />}
              {above.map((col) => (
                <td key={col.id}>{conditions(col)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const colSpan = 2 + (decision ? 1 : 0) + 1;
  const conclusionRow = (col: Column) => (
    <tr key={col.id}>
      <th scope="row">{col.label || "(unnamed)"}</th>
      {decision && <td>{decisionText(col)}</td>}
      <td>{plainText(col)}</td>
      <td>{conditions(col)}</td>
    </tr>
  );

  return (
    <div className="output-synthesis" data-testid="output-synthesis">
      <h3>Overall Judgement</h3>
      <table className="output-table">
        <thead>
          <tr>
            <th>Conclusion</th>
            {decision && <th>Decision</th>}
            <th>Plain description</th>
            <th>Criterion conditions</th>
          </tr>
        </thead>
        <tbody>
          {above.map(conclusionRow)}
          {showBar && <BarRow colSpan={colSpan} />}
          {below.map(conclusionRow)}
        </tbody>
      </table>
    </div>
  );
}

/** An evidence-tier rubric rendered read-only: methods × its own continuum, the
 *  Sufficient Bar drawn as a divider (Q51 note 2), in whichever layout the user
 *  picked (Q51 note 3) — the toggle governs this tier too, not just the
 *  conclusion rubrics above it. "horizontal" keeps methods as rows and
 *  conclusions as columns (negative left, positive right, bar a divider
 *  column); "vertical" transposes so conclusions are rows (positive on top,
 *  negative at the bottom, bar a divider row) and methods become columns. */
function RubricTierTable({
  doc,
  node,
  continuum,
  cells,
  layout,
}: {
  doc: EvaluationQuestion;
  node: MesoNode;
  continuum: Continuum;
  cells: { evidenceMethodId: string; columnId: string; description: string }[];
  layout: RubricLayout;
}) {
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const { below, above } = columnsByBar(continuum);
  const showBar = below.length > 0 && above.length > 0;
  const descFor = (methodId: string, columnId: string) =>
    cells.find((mc) => mc.evidenceMethodId === methodId && mc.columnId === columnId)
      ?.description ?? "";
  const methodLabel = (methodId: string) =>
    methodById.get(methodId)
      ? methodOutputLabel(methodById.get(methodId)!, doc.evidenceMethods)
      : "(unknown)";

  if (layout === "vertical") {
    const conclusionRow = (col: Column) => (
      <tr key={col.id}>
        <th scope="row">{col.label || "(unnamed)"}</th>
        {node.evidenceLinks.map((link) => (
          <td key={link.id}>{descFor(link.evidenceMethodId, col.id)}</td>
        ))}
      </tr>
    );
    return (
      <table className="output-table">
        <thead>
          <tr>
            <th>Conclusion</th>
            {node.evidenceLinks.map((link) => (
              <th key={link.id}>{methodLabel(link.evidenceMethodId)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {above.map(conclusionRow)}
          {showBar && <BarRow colSpan={1 + node.evidenceLinks.length} />}
          {below.map(conclusionRow)}
        </tbody>
      </table>
    );
  }

  return (
    <table className="output-table rubric-columns">
      <thead>
        <tr>
          <th className="rubric-corner">Evidence / Method</th>
          {below.map((c) => (
            <th key={c.id}>{c.label || "(unnamed)"}</th>
          ))}
          {showBar && (
            <th
              className="sufficient-bar-col-head"
              data-testid="output-sufficient-bar"
              title="Sufficient Bar"
              aria-label="Sufficient Bar"
            />
          )}
          {above.map((c) => (
            <th key={c.id}>{c.label || "(unnamed)"}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {node.evidenceLinks.map((link) => (
          <tr key={link.id}>
            <th scope="row">{methodLabel(link.evidenceMethodId)}</th>
            {below.map((c) => (
              <td key={c.id}>{descFor(link.evidenceMethodId, c.id)}</td>
            ))}
            {showBar && <td className="sufficient-bar-col" />}
            {above.map((c) => (
              <td key={c.id}>{descFor(link.evidenceMethodId, c.id)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
