import { useState } from "react";
import { negativeColumns, positiveColumns } from "../domain/continuum";
import { checkEvidenceTier, checkEvidenceTierComplete } from "../domain/invariants";
import type { Column, EvidenceTierRubric, MesoNode } from "../domain/schema";
import { useStore } from "../store/store";
import {
  evidenceIncomplete,
  firstIncompleteView,
  mixedMethodsUnresolved,
} from "../store/wizard";
import { WizardNav } from "./WizardNav";

/**
 * J7 + J8, per node: the criterion rubric read-only at the top (R-068/R-069),
 * Evidence/Method planning below — a shared pool with reuse and dedupe-linking
 * (R-070–R-073, R-079–R-082). The J9 mixed-methods step runs between the
 * methods and the tier (Q24 redirected 2026-07-14), so the mandatory
 * evidence-tier fork — an Evidence-tier Rubric xor a Data Description List
 * (R-074–R-076, Q13/Q32) — opens only once the node's mixed step is resolved,
 * and both shapes arrive pre-populated with one row per linked Evidence/Method
 * (2026-07-14 notes). Completing a node routes to the next one still needing
 * evidence work (R-077), with up/down navigation and work saved as typed (R-078).
 */
export function EvidenceView() {
  const doc = useStore((s) => s.doc);
  const addEvidenceMethod = useStore((s) => s.addEvidenceMethod);
  const reuseEvidenceMethod = useStore((s) => s.reuseEvidenceMethod);
  const updateEvidenceMethod = useStore((s) => s.updateEvidenceMethod);
  const updateFitJustification = useStore((s) => s.updateFitJustification);
  const removeEvidenceLink = useStore((s) => s.removeEvidenceLink);
  const linkMethodsAsSame = useStore((s) => s.linkMethodsAsSame);
  const unlinkMethods = useStore((s) => s.unlinkMethods);
  const chooseEvidenceTier = useStore((s) => s.chooseEvidenceTier);
  const setDataDescription = useStore((s) => s.setDataDescription);
  const updateDataEntry = useStore((s) => s.updateDataEntry);
  const removeDataEntry = useStore((s) => s.removeDataEntry);
  const setEvidenceColumnLabel = useStore((s) => s.setEvidenceColumnLabel);
  const addEvidenceColumn = useStore((s) => s.addEvidenceColumn);
  const removeEvidenceColumn = useStore((s) => s.removeEvidenceColumn);
  const setMethodLevelDescription = useStore((s) => s.setMethodLevelDescription);
  const setView = useStore((s) => s.setView);

  const [index, setIndex] = useState(() => {
    // A J10 add-evidence re-entry (or a Back from the mixed step) opens on the
    // node it came from; otherwise the first node still lacking its tier.
    const layer = useStore.getState().doc?.mesoLayers.find((l) => l.tierOrder === 0);
    const focused =
      layer?.nodes.findIndex((n) => n.id === useStore.getState().focusNodeId) ?? -1;
    if (focused >= 0) return focused;
    const at =
      layer?.nodes.findIndex(
        (n) => evidenceIncomplete(n) || mixedMethodsUnresolved(n),
      ) ?? -1;
    return at >= 0 ? at : 0;
  });
  const [form, setForm] = useState({ name: "", what: "", fit: "" });
  const [reuseId, setReuseId] = useState("");
  const [dedupe, setDedupe] = useState({ a: "", b: "" });
  const [gateMessages, setGateMessages] = useState<string[]>([]);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer || layer.nodes.length === 0) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const nodes = layer.nodes;
  const node = nodes[Math.min(index, nodes.length - 1)]!;
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const linkedIds = new Set(node.evidenceLinks.map((l) => l.evidenceMethodId));
  const poolReusable = doc.evidenceMethods.filter((m) => !linkedIds.has(m.id));

  const goTo = (next: number) => {
    if (next >= 0 && next < nodes.length) {
      setIndex(next);
      setGateMessages([]);
      setForm({ name: "", what: "", fit: "" });
      setReuseId("");
    }
  };

  // ---- Read-only criterion rubric (R-068/R-069) ------------------------------
  const negatives = negativeColumns(layer.continuum);
  const positives = positiveColumns(layer.continuum);
  const rubricPreview = (
    <div
      className="continuum-grid review-grid evidence-rubric-preview"
      data-testid="evidence-rubric-preview"
      style={{
        gridTemplateColumns: `repeat(${negatives.length}, minmax(8rem, 1fr)) 12px repeat(${positives.length}, minmax(8rem, 1fr))`,
      }}
    >
      {[...negatives, ...positives].map((c, i) => {
        const gridColumn = i < negatives.length ? i + 1 : i + 2;
        const cell = node.cells.find((cc) => cc.columnId === c.id);
        return (
          <div key={c.id} style={{ display: "contents" }}>
            <div className="col-header" style={{ gridColumn, gridRow: 1 }}>
              {c.label}
            </div>
            <div
              className={cell?.included ? "review-cell" : "review-cell cell-excluded"}
              style={{ gridColumn, gridRow: 2 }}
            >
              {cell?.included ? cell.plainDescription : ""}
            </div>
          </div>
        );
      })}
      <div
        className="sufficient-bar"
        title="Sufficient Bar"
        style={{ gridColumn: negatives.length + 1, gridRow: "1 / 3" }}
      />
    </div>
  );

  // ---- Evidence-tier editors (J8) --------------------------------------------
  // The tier opens only once this node's J9 mixed-methods step is resolved
  // (Q24 redirected 2026-07-14) — a combined mixed source must exist before
  // the tier describes it.
  const mixedUnresolved = mixedMethodsUnresolved(node);
  const tier = node.evidenceTier;

  // Every linked Evidence/Method has its own auto row — no add-entry control;
  // a method added above appears here at once (2026-07-14 notes). Each auto row
  // binds to the method's first entry; anything else in the entries array
  // (older documents' free entries) stays editable below as "other entries".
  const boundEntryFor = (methodId: string) =>
    tier?.shape === "list"
      ? tier.entries.find((e) => e.evidenceMethodId === methodId)
      : undefined;
  const legacyEntries =
    tier?.shape === "list"
      ? tier.entries
          .map((entry, entryIndex) => ({ entry, entryIndex }))
          .filter(
            ({ entry }) =>
              entry.evidenceMethodId === undefined ||
              !linkedIds.has(entry.evidenceMethodId) ||
              boundEntryFor(entry.evidenceMethodId) !== entry,
          )
      : [];

  const listEditor = tier?.shape === "list" && (
    <div className="tier-editor">
      <p className="hint">
        Describe what each evidence source can show — no quality levels here (that is
        the rubric option's job). Every Evidence/Method linked to this {nodeLabel}{" "}
        already has its own entry below; add a method above and it appears here.
      </p>
      {node.evidenceLinks.map((link, i) => (
        <div key={link.id} className="data-entry">
          <span
            className="method-row-label data-entry-method"
            data-testid={`data-entry-method-${i}`}
          >
            {methodById.get(link.evidenceMethodId)?.name ?? "(unnamed)"}
          </span>
          <textarea
            rows={2}
            placeholder="What can this evidence source show about merit? Describe the data / outputs it will provide."
            data-testid={`data-description-${i}`}
            value={boundEntryFor(link.evidenceMethodId)?.description ?? ""}
            onChange={(e) =>
              setDataDescription(node.id, link.evidenceMethodId, e.target.value)
            }
          />
        </div>
      ))}
      {legacyEntries.length > 0 && (
        <>
          <p className="hint">Other entries (not tied to a linked Evidence/Method):</p>
          {legacyEntries.map(({ entry, entryIndex }) => (
            <div key={entryIndex} className="data-entry data-entry-legacy">
              <textarea
                rows={2}
                data-testid={`data-legacy-${entryIndex}`}
                value={entry.description}
                onChange={(e) =>
                  updateDataEntry(node.id, entryIndex, { description: e.target.value })
                }
              />
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove entry ${entryIndex + 1}`}
                onClick={() => removeDataEntry(node.id, entryIndex)}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const rubricEditor = tier?.shape === "rubric" && (
    <EvidenceRubricEditor
      tier={tier}
      node={node}
      methodName={(id) => methodById.get(id)?.name ?? "(unnamed)"}
      onLabel={(columnId, label) => setEvidenceColumnLabel(node.id, columnId, label)}
      onAdd={(side) => addEvidenceColumn(node.id, side)}
      onRemove={(columnId) => removeEvidenceColumn(node.id, columnId)}
      onCell={(methodId, columnId, text) =>
        setMethodLevelDescription(node.id, methodId, columnId, text)
      }
    />
  );

  return (
    <section className="panel">
      <h2>
        Plan the evidence for “{node.name}”
      </h2>
      <div className="row-nav">
        <button
          type="button"
          data-testid="evidence-prev"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          ↑ Previous
        </button>
        <span data-testid="evidence-position">
          {nodeLabel} {index + 1} of {nodes.length}
        </span>
        <button
          type="button"
          data-testid="evidence-next"
          disabled={index === nodes.length - 1}
          onClick={() => goTo(index + 1)}
        >
          ↓ Next
        </button>
      </div>

      <p className="hint" data-testid="evidence-rubric-note">
        The rubric is shown for reference only — you will connect evidence to these
        conclusions in a later step.
      </p>
      {rubricPreview}

      <h3>Evidence / Methods</h3>
      {node.evidenceLinks.map((link) => {
        const method = methodById.get(link.evidenceMethodId);
        if (!method) return null;
        return (
          <div key={link.id} className="method-card" data-testid={`method-card-${method.name}`}>
            <div className="node-card-header">
              <input
                className="node-name"
                aria-label="Evidence / Method name"
                value={method.name}
                onChange={(e) => updateEvidenceMethod(method.id, "name", e.target.value)}
              />
              <button
                type="button"
                className="chip-remove"
                data-testid={`remove-method-${method.name}`}
                aria-label={`Remove "${method.name}" from this ${nodeLabel}`}
                title="Remove from this node (moves the link to the Recycle Bin; the method stays in the pool)"
                onClick={() => removeEvidenceLink(node.id, link.id)}
              >
                ×
              </button>
            </div>
            <label className="node-field">
              What will be done (sampling, process, data collection)
              <textarea
                rows={2}
                value={method.whatWillBeDone ?? ""}
                onChange={(e) =>
                  updateEvidenceMethod(method.id, "whatWillBeDone", e.target.value)
                }
              />
            </label>
            <label className="node-field">
              Fit justification — how this method fits this {nodeLabel} (written anew per{" "}
              {nodeLabel})
              <textarea
                rows={2}
                data-testid={`fit-${method.name}`}
                value={link.fitJustification}
                onChange={(e) => updateFitJustification(node.id, link.id, e.target.value)}
              />
            </label>
            {(method.dedupeLinkedIds?.length ?? 0) > 0 && (
              <p className="hint">
                Same method as:{" "}
                {method.dedupeLinkedIds!.map((otherId) => (
                  <span key={otherId} className="value-chip">
                    {methodById.get(otherId)?.name ?? "(unnamed)"}
                    <button
                      type="button"
                      className="chip-remove"
                      aria-label={`Unlink from ${methodById.get(otherId)?.name}`}
                      onClick={() => unlinkMethods(method.id, otherId)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        );
      })}

      <div className="method-form">
        <h4>Describe a new Evidence / Method</h4>
        <label>
          Evidence / Method name
          <input
            data-testid="method-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          What will be done
          <textarea
            data-testid="method-what"
            rows={2}
            value={form.what}
            onChange={(e) => setForm({ ...form, what: e.target.value })}
          />
        </label>
        <label>
          Fit justification — how it fits this {nodeLabel}
          <textarea
            data-testid="fit-justification"
            rows={2}
            value={form.fit}
            onChange={(e) => setForm({ ...form, fit: e.target.value })}
          />
        </label>
        <button
          type="button"
          data-testid="attach-evidence"
          onClick={() => {
            if (form.name.trim() === "") {
              setGateMessages(["Name the Evidence / Method."]);
              return;
            }
            setGateMessages([]);
            addEvidenceMethod(node.id, {
              name: form.name.trim(),
              whatWillBeDone: form.what.trim(),
              fitJustification: form.fit.trim(),
            });
            setForm({ name: "", what: "", fit: "" });
          }}
        >
          Add Evidence / Method
        </button>

        {poolReusable.length > 0 && (
          <div className="reuse-row">
            <label>
              Or reuse one already described (its details travel with it; you write a
              fresh fit justification)
              <select
                data-testid="reuse-select"
                value={reuseId}
                onChange={(e) => setReuseId(e.target.value)}
              >
                <option value="">Choose from the shared pool…</option>
                {poolReusable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              data-testid="reuse-method"
              disabled={reuseId === ""}
              onClick={() => {
                reuseEvidenceMethod(node.id, reuseId);
                setReuseId("");
              }}
            >
              Reuse on this {nodeLabel}
            </button>
          </div>
        )}

        {doc.evidenceMethods.length >= 2 && (
          <div className="reuse-row">
            <label>
              Link two descriptions as the <em>same</em> method (they merge for the
              Evidence Matrix)
              <span className="dedupe-selects">
                <select
                  aria-label="First method"
                  data-testid="dedupe-a"
                  value={dedupe.a}
                  onChange={(e) => setDedupe({ ...dedupe, a: e.target.value })}
                >
                  <option value="">First…</option>
                  {doc.evidenceMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Second method"
                  data-testid="dedupe-b"
                  value={dedupe.b}
                  onChange={(e) => setDedupe({ ...dedupe, b: e.target.value })}
                >
                  <option value="">Second…</option>
                  {doc.evidenceMethods
                    .filter((m) => m.id !== dedupe.a)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </span>
            </label>
            <button
              type="button"
              className="secondary"
              data-testid="dedupe-link"
              disabled={dedupe.a === "" || dedupe.b === ""}
              onClick={() => {
                linkMethodsAsSame(dedupe.a, dedupe.b);
                setDedupe({ a: "", b: "" });
              }}
            >
              Link as same method
            </button>
          </div>
        )}
      </div>

      {mixedUnresolved ? (
        <div className="tier-pending" data-testid="tier-pending">
          <h3>Next: mixed methods</h3>
          <p className="hint">
            Before choosing how to explain value within each evidence source, say
            whether any of these Evidence/Methods mix methods — a combined
            mixed-methods source is what gets described and judged at the evidence
            tier, so it has to exist first.
          </p>
        </div>
      ) : (
        <>
      <h3>Choose how to explain value within each evidence source</h3>
      {!tier ? (
        <>
          <p>
            Choose exactly one way to describe the evidence this {nodeLabel} will rest
            on — every {nodeLabel} must have one, and only one, of the two.
          </p>
          <div className="structure-choices">
            <button
              type="button"
              className="structure-choice"
              data-testid="choose-rubric"
              onClick={() => chooseEvidenceTier(node.id, "rubric")}
            >
              <strong>Evidence-tier Rubric</strong>
              <span>
                A nested rubric: author quality/success levels for the collective
                evidence set, then describe each method at those levels.
              </span>
            </button>
            <button
              type="button"
              className="structure-choice"
              data-testid="choose-list"
              onClick={() => chooseEvidenceTier(node.id, "list")}
            >
              <strong>Data Description List</strong>
              <span>
                Describe what data and outputs will be available, without specifying
                quality levels.
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          {listEditor}
          {rubricEditor}
          <button
            type="button"
            className="link-button"
            data-testid="switch-tier"
            onClick={() =>
              chooseEvidenceTier(node.id, tier.shape === "list" ? "rubric" : "list")
            }
          >
            Switch to {tier.shape === "list" ? "an Evidence-tier Rubric" : "a Data Description List"}{" "}
            instead (current work moves to the Recycle Bin)
          </button>
        </>
      )}
        </>
      )}

      <div className="evidence-footer">
        <WizardNav
          continueTestId="evidence-continue"
          continueLabel={
            mixedUnresolved
              ? "Continue to mixed methods"
              : `Done with this ${nodeLabel} — continue`
          }
          onContinue={() => {
            // The J9 mixed-methods step runs between this node's methods and
            // its evidence tier (Q24 redirected 2026-07-14) — only the ≥1-method
            // part of Invariant 8 gates the hand-over.
            if (mixedUnresolved) {
              if (node.evidenceLinks.length < 1) {
                setGateMessages([
                  `"${node.name}" needs at least one Evidence / Method attached.`,
                ]);
                return;
              }
              setGateMessages([]);
              useStore.setState({ focusNodeId: node.id });
              setView("mixed");
              return;
            }
            const gates = [
              ...checkEvidenceTier(node).filter((i) => i.mode === "gate"),
              ...checkEvidenceTierComplete(node),
            ];
            setGateMessages(gates.map((g) => g.message));
            if (gates.length > 0) return;
            // A J10 add-evidence re-entry runs only this subset (R-094/R-095):
            // hand straight back to the connect step — unless an earlier gate
            // broke meanwhile, in which case the frontier wins (never overshoot).
            const returnTo = useStore.getState().evidenceReturnTo;
            if (returnTo) {
              useStore.setState({ evidenceReturnTo: null, focusNodeId: node.id });
              const frontier = firstIncompleteView(useStore.getState().doc!);
              setView(frontier === "home" || frontier === returnTo ? returnTo : frontier);
              return;
            }
            // Move to the next node still needing evidence-phase work (R-077),
            // then let the wizard route onward (connect, or Home).
            const next = nodes.findIndex(
              (n, i) =>
                i !== index && (evidenceIncomplete(n) || mixedMethodsUnresolved(n)),
            );
            if (next >= 0) goTo(next);
            else setView(firstIncompleteView(doc));
          }}
        />
        <aside className="traffic-panel evidence-progress">
          {nodes.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={i === index ? "traffic-item current" : "traffic-item"}
              data-testid={`evidence-traffic-${n.order}`}
              onClick={() => goTo(i)}
            >
              <span
                className={`light ${
                  evidenceIncomplete(n) || mixedMethodsUnresolved(n)
                    ? "light-red"
                    : "light-green"
                }`}
                aria-hidden="true"
              />
              <span className="traffic-name">{n.name}</span>
            </button>
          ))}
        </aside>
      </div>
      {gateMessages.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}
    </section>
  );
}

/** The nested rubric editor (R-075): its own continuum over the collective
 *  evidence set, one row per linked Evidence/Method. */
function EvidenceRubricEditor(props: {
  tier: EvidenceTierRubric;
  node: MesoNode;
  methodName: (id: string) => string;
  onLabel: (columnId: string, label: string) => void;
  onAdd: (side: "negative" | "positive") => void;
  onRemove: (columnId: string) => void;
  onCell: (methodId: string, columnId: string, text: string) => void;
}) {
  const { tier, node } = props;
  const negatives = negativeColumns(tier.continuum);
  const positives = positiveColumns(tier.continuum);
  const barCol = 2 + negatives.length;
  const gridTemplateColumns = `minmax(8rem, 11rem) repeat(${negatives.length}, minmax(8rem, 1fr)) 12px repeat(${positives.length}, minmax(8rem, 1fr))`;
  const columnFor = (side: "negative" | "positive", i: number) =>
    side === "negative" ? i + 2 : barCol + 1 + i;
  const cellText = (methodId: string, columnId: string) =>
    tier.methodLevelCells.find(
      (c) => c.evidenceMethodId === methodId && c.columnId === columnId,
    )?.description ?? "";

  const header = (column: Column, side: "negative" | "positive", i: number) => {
    const canRemove = (side === "negative" ? negatives : positives).length > 1;
    return (
      <div
        key={column.id}
        className={`col-header col-${side}`}
        style={{ gridColumn: columnFor(side, i), gridRow: 1 }}
      >
        <div className="col-header-top">
          <span className="col-side-tag">
            {side === "negative" ? "below the bar" : "above the bar"}
          </span>
          <button
            type="button"
            className="chip-remove"
            data-testid={`remove-evidence-column-${column.ordinal}`}
            disabled={!canRemove}
            aria-label={`Remove evidence column ${column.ordinal}`}
            onClick={() => props.onRemove(column.id)}
          >
            ×
          </button>
        </div>
        <input
          data-testid={`evidence-column-label-${column.ordinal}`}
          placeholder="Column Header"
          value={column.label}
          onChange={(e) => props.onLabel(column.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="tier-editor">
      <p className="hint">
        Author the quality/success levels for this {""}
        collective evidence set, then describe each Evidence/Method at the levels it can
        show.
      </p>
      <div className="continuum-actions">
        <button
          type="button"
          className="secondary"
          data-testid="add-evidence-negative-column"
          onClick={() => props.onAdd("negative")}
        >
          + Add level below the bar
        </button>
        <button
          type="button"
          className="secondary"
          data-testid="add-evidence-positive-column"
          onClick={() => props.onAdd("positive")}
        >
          + Add level above the bar
        </button>
      </div>
      <div className="continuum-grid review-grid" style={{ gridTemplateColumns }}>
        <div className="col-header" style={{ gridColumn: 1, gridRow: 1 }} />
        {negatives.map((c, i) => header(c, "negative", i))}
        <div
          className="sufficient-bar"
          title="Sufficient Bar"
          style={{ gridColumn: barCol, gridRow: `1 / ${node.evidenceLinks.length + 2}` }}
        />
        {positives.map((c, i) => header(c, "positive", i))}
        {node.evidenceLinks.map((link, row) => (
          <div key={link.id} style={{ display: "contents" }}>
            <div className="review-row-label method-row-label" style={{ gridColumn: 1, gridRow: row + 2 }}>
              {props.methodName(link.evidenceMethodId)}
            </div>
            {[...negatives, ...positives].map((c, i) => (
              <textarea
                key={c.id}
                rows={3}
                className="evidence-level-cell"
                data-testid={`evidence-cell-${row}-${c.ordinal}`}
                placeholder="Level description"
                value={cellText(link.evidenceMethodId, c.id)}
                onChange={(e) => props.onCell(link.evidenceMethodId, c.id, e.target.value)}
                style={{
                  gridColumn:
                    i < negatives.length
                      ? columnFor("negative", i)
                      : columnFor("positive", i - negatives.length),
                  gridRow: row + 2,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
