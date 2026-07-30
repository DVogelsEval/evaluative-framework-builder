import { useEffect, useState } from "react";
import { checkMixedMethods } from "../domain/invariants";
import { MIXED_TYPE_LABELS } from "../domain/mixedMethods";
import type { EvidenceMethod, MixedMethodsType } from "../domain/schema";
import { useStore } from "../store/store";
import {
  evidenceIncomplete,
  firstIncompleteView,
  mixedMethodsUnresolved,
} from "../store/wizard";
import { WizardNav } from "./WizardNav";

/**
 * J9, per node, between the node's Evidence/Methods and its evidence tier
 * (Q24 redirected 2026-07-14): the mixed-methods step. Three non-exclusive
 * options (R-163): combine ≥2 methods into a mixed-methods source
 * (R-169–R-173, with the sub-methods retention view — R-174/R-175, Q27/⚠Q38),
 * tick existing sources that are themselves mixed (R-165–R-168), or no mixed
 * methods at all (R-164). When both are chosen, combining runs first and the
 * tick step re-surfaces (GWT-9.4). Combining links the new source to the node,
 * so the evidence-tier description that follows covers it (Q39, R-176).
 */

type Phase = "choose" | "combine" | "retention" | "tick";

export function MixedMethodsView() {
  const doc = useStore((s) => s.doc);
  const combineMethods = useStore((s) => s.combineMethods);
  const setMixedMethodsType = useStore((s) => s.setMixedMethodsType);
  const setMixedMethodsCustomName = useStore((s) => s.setMixedMethodsCustomName);
  const tickMethodAsMixed = useStore((s) => s.tickMethodAsMixed);
  const setSubMethodRetention = useStore((s) => s.setSubMethodRetention);
  const resolveMixedMethods = useStore((s) => s.resolveMixedMethods);
  const setView = useStore((s) => s.setView);

  const [index] = useState(() => {
    const state = useStore.getState();
    const layer = state.doc?.mesoLayers.find((l) => l.tierOrder === 0);
    const focused = layer?.nodes.findIndex((n) => n.id === state.focusNodeId) ?? -1;
    if (focused >= 0) return focused;
    const unresolved = layer?.nodes.findIndex((n) => mixedMethodsUnresolved(n)) ?? -1;
    return unresolved >= 0 ? unresolved : 0;
  });
  const [phase, setPhase] = useState<Phase>("choose");
  const [optCombine, setOptCombine] = useState(false);
  const [optTick, setOptTick] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "" as "" | MixedMethodsType,
    customName: "",
    explanation: "",
  });
  const [gateMessages, setGateMessages] = useState<string[]>([]);

  useEffect(() => {
    useStore.setState({ focusNodeId: null });
  }, []);

  const layer = doc?.mesoLayers.find((l) => l.tierOrder === 0);
  if (!doc || !layer || layer.nodes.length === 0) return null;

  const nodeLabel = layer.kind === "criteria" ? "criterion" : "component";
  const node = layer.nodes[Math.min(index, layer.nodes.length - 1)]!;
  const methodById = new Map(doc.evidenceMethods.map((m) => [m.id, m]));
  const linkedMethods = node.evidenceLinks
    .map((l) => methodById.get(l.evidenceMethodId))
    .filter((m): m is EvidenceMethod => m !== undefined);
  // Members for a new combination: this node's plain (not-yet-mixed) methods (⚠Q38).
  const combinable = linkedMethods.filter((m) => !m.isMixedMethodsSource);
  // Combined sources on this node — their sub-methods space (R-172/R-174).
  const combinedSources = linkedMethods.filter((m) => m.memberSubMethods !== undefined);
  // Tickable in the some-existing flow: everything except combined sources (R-165).
  const tickable = linkedMethods.filter((m) => m.memberSubMethods === undefined);

  const finish = (note?: string) => {
    resolveMixedMethods(node.id, note);
    // Route onward — normally back to this node's evidence view, where the
    // tier step now opens covering any combined source (Q24 redirect, R-176).
    const doc = useStore.getState().doc!;
    const layerNow = doc.mesoLayers.find((l) => l.tierOrder === 0);
    const nodeNow = layerNow?.nodes.find((n) => n.id === node.id);
    if (nodeNow && evidenceIncomplete(nodeNow)) {
      useStore.setState({ focusNodeId: node.id });
    }
    setView(firstIncompleteView(doc));
  };

  const toggleMember = (methodId: string) => {
    setMemberIds((ids) =>
      ids.includes(methodId) ? ids.filter((id) => id !== methodId) : [...ids, methodId],
    );
  };

  // ---- Phase: choose (R-163/R-164) -------------------------------------------
  const choosePhase = (
    <>
      <p>
        Do any Evidence/Methods for this {nodeLabel} mix methods? You can choose
        either, both, or neither option.
      </p>
      <label className="option-tick">
        <input
          type="checkbox"
          data-testid="opt-combine"
          checked={optCombine}
          disabled={combinable.length < 2}
          onChange={(e) => setOptCombine(e.target.checked)}
        />
        <span>
          <strong>Combine existing methods into a mixed-methods source</strong>
          {combinable.length < 2 && " (needs at least two methods on this " + nodeLabel + ")"}
        </span>
      </label>
      <label className="option-tick">
        <input
          type="checkbox"
          data-testid="opt-some-existing"
          checked={optTick}
          onChange={(e) => setOptTick(e.target.checked)}
        />
        <span>
          <strong>Some existing sources are themselves mixed-methods</strong>
        </span>
      </label>
      {optCombine && optTick && (
        <p className="hint" data-testid="both-options-note">
          Combining runs first; afterwards you will return here to tick which
          existing methods are already mixed-methods.
        </p>
      )}
    </>
  );

  // ---- Phase: combine (R-169–R-171) -------------------------------------------
  const selectedMembers = memberIds
    .map((id) => methodById.get(id))
    .filter((m): m is EvidenceMethod => m !== undefined);

  const combinePhase = (
    <>
      <p>
        Drag (or click) two or more Evidence/Methods together. The connecting
        line carries the mixed-methods type and your explanation of the strategy.
      </p>
      <div className="combine-pool">
        {combinable.map((m) => {
          const selected = memberIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={selected ? "combine-card combine-card-selected" : "combine-card"}
              data-testid={`combine-pick-${m.name}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
              onClick={() => toggleMember(m.id)}
            >
              {m.name}
              <span className="hint">{selected ? "in the combination" : "click or drag to combine"}</span>
            </button>
          );
        })}
      </div>
      <div
        className="combine-area"
        data-testid="combine-area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id && !memberIds.includes(id) && combinable.some((m) => m.id === id)) {
            setMemberIds((ids) => [...ids, id]);
          }
        }}
      >
        {selectedMembers.length === 0 ? (
          <p className="hint">Drop methods here to combine them.</p>
        ) : (
          <div className="combine-line-row">
            {selectedMembers.map((m, i) => (
              <div key={m.id} className="combine-line-item">
                {i > 0 && <span className="combine-line" aria-hidden="true" />}
                <span className="combine-member" data-testid={`combine-member-${m.name}`}>
                  {m.name}
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove "${m.name}" from the combination`}
                    onClick={() => toggleMember(m.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="combine-middle">
          <label>
            Mixed-methods type (stored once, on the combined source)
            <select
              data-testid="combine-type"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as "" | MixedMethodsType })
              }
            >
              <option value="">Choose a type…</option>
              {Object.entries(MIXED_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.type === "other" && (
            <label>
              Your strategy's name
              <input
                data-testid="combine-custom-name"
                value={form.customName}
                onChange={(e) => setForm({ ...form, customName: e.target.value })}
              />
            </label>
          )}
          <label>
            Explanation of the mixed-methods strategy
            <textarea
              rows={2}
              data-testid="combine-explanation"
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            />
          </label>
          <label>
            Name for the combined source
            <input
              data-testid="combine-name"
              placeholder={selectedMembers.map((m) => m.name).join(" + ")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
        </div>
      </div>
      <button
        type="button"
        className="link-button"
        data-testid="skip-combining"
        onClick={() => {
          setGateMessages([]);
          setMemberIds([]);
          if (optTick) setPhase("tick");
          else setPhase("choose");
        }}
      >
        Changed your mind? Skip combining
      </button>
    </>
  );

  const createCombination = (): boolean => {
    const messages: string[] = [];
    if (memberIds.length < 2) {
      messages.push("Combine at least two Evidence/Methods.");
    }
    if (form.type === "") messages.push("Choose the mixed-methods type.");
    if (form.type === "other" && form.customName.trim() === "") {
      messages.push("Name your own strategy.");
    }
    if (form.explanation.trim() === "") {
      messages.push("Explain the mixed-methods strategy.");
    }
    setGateMessages(messages);
    if (messages.length > 0 || form.type === "") return false;
    const name =
      form.name.trim() !== ""
        ? form.name.trim()
        : selectedMembers.map((m) => m.name).join(" + ");
    combineMethods(node.id, memberIds, {
      name,
      type: form.type,
      ...(form.type === "other" ? { customName: form.customName.trim() } : {}),
      explanation: form.explanation.trim(),
    });
    setMemberIds([]);
    setForm({ name: "", type: "", customName: "", explanation: "" });
    return true;
  };

  // ---- Phase: retention — the sub-methods space (R-172, R-174/R-175, Q27/⚠Q38) --
  const retentionPhase = (
    <>
      <p>
        The combined source now sits at the Evidence/Method tier; its members
        were copied one tier below as <strong>sub-methods</strong>. For each
        sub-method: is it also used for other purposes on this {nodeLabel}?
      </p>
      {combinedSources.map((source) => (
        <div key={source.id} className="submethods-space" data-testid={`submethods-${source.name}`}>
          <h4>
            {source.name}
            <span className="box-kind">
              {source.mixedMethodsType === "other"
                ? source.mixedMethodsCustomName
                : source.mixedMethodsType !== undefined
                  ? MIXED_TYPE_LABELS[source.mixedMethodsType]
                  : ""}
            </span>
          </h4>
          {(source.memberSubMethods ?? []).map((sub) => {
            const sourceMethod = methodById.get(sub.sourceMethodId);
            return (
              <div key={sub.id} className="submethod-row">
                <span className="submethod-name">{sourceMethod?.name ?? "(unnamed)"}</span>
                <label className="option-tick">
                  <input
                    type="radio"
                    name={`retention-${sub.id}`}
                    data-testid={`retain-${sourceMethod?.name}`}
                    checked={sub.retainedAtEvidenceTier}
                    onChange={() => setSubMethodRetention(node.id, sub.id, true)}
                  />
                  <span>Also used for other purposes — keep it at the Evidence/Method tier</span>
                </label>
                <label className="option-tick">
                  <input
                    type="radio"
                    name={`retention-${sub.id}`}
                    data-testid={`unretain-${sourceMethod?.name}`}
                    checked={!sub.retainedAtEvidenceTier}
                    onChange={() => setSubMethodRetention(node.id, sub.id, false)}
                  />
                  <span>Only for this mixed source — it lives in the sub-methods space alone</span>
                </label>
              </div>
            );
          })}
        </div>
      ))}
      {combinable.length >= 2 && (
        <button
          type="button"
          className="link-button"
          data-testid="combine-another"
          onClick={() => {
            setGateMessages([]);
            setPhase("combine");
          }}
        >
          + Combine another set of methods
        </button>
      )}
    </>
  );

  // ---- Phase: tick — some existing are mixed (R-165–R-168) ---------------------
  const tickPhase = (
    <>
      <p>
        Tick each Evidence/Method that is itself a mixed-methods source, and say
        which type it is. A note is saved in the sub-methods space — no
        sub-method copies are created.
      </p>
      {tickable.map((m) => (
        <div key={m.id} className="tick-row">
          <label className="option-tick">
            <input
              type="checkbox"
              data-testid={`tick-mixed-${m.name}`}
              checked={m.isMixedMethodsSource}
              onChange={(e) => tickMethodAsMixed(m.id, e.target.checked)}
            />
            <span>{m.name}</span>
          </label>
          {m.isMixedMethodsSource && (
            <>
              <select
                aria-label={`Mixed-methods type for ${m.name}`}
                data-testid={`tick-type-${m.name}`}
                value={m.mixedMethodsType ?? ""}
                onChange={(e) =>
                  e.target.value !== "" &&
                  setMixedMethodsType(m.id, e.target.value as MixedMethodsType)
                }
              >
                <option value="">Choose a type…</option>
                {Object.entries(MIXED_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {m.mixedMethodsType === "other" && (
                <input
                  aria-label={`Strategy name for ${m.name}`}
                  data-testid={`tick-custom-${m.name}`}
                  placeholder="Your strategy's name"
                  value={m.mixedMethodsCustomName ?? ""}
                  onChange={(e) => setMixedMethodsCustomName(m.id, e.target.value)}
                />
              )}
            </>
          )}
        </div>
      ))}
    </>
  );

  // ---- The step footer: one Back, one Continue, per phase ----------------------
  const onContinue = () => {
    setGateMessages([]);
    if (phase === "choose") {
      if (!optCombine && !optTick) {
        finish(); // "no mixed methods" — continue with no changes (R-164)
      } else if (optCombine) {
        setPhase("combine");
      } else {
        setPhase("tick");
      }
      return;
    }
    if (phase === "combine") {
      if (createCombination()) setPhase("retention");
      return;
    }
    if (phase === "retention") {
      if (optTick) setPhase("tick");
      else finish();
      return;
    }
    // tick: every ticked method needs its type (+ own name for "other")
    const gates = tickable.flatMap((m) => checkMixedMethods(m));
    setGateMessages(gates.map((g) => g.message));
    if (gates.length > 0) return;
    const ticked = tickable.filter((m) => m.isMixedMethodsSource);
    finish(
      ticked.length > 0
        ? `Mixing occurs within ${ticked.length} existing Evidence/Method(s) of this ${nodeLabel}.`
        : undefined,
    );
  };

  const continueLabel =
    phase === "choose" && !optCombine && !optTick
      ? "No mixed methods — continue"
      : phase === "combine"
        ? "Create the mixed-methods source"
        : "Continue";

  return (
    <section className="panel">
      <h2>Mixed methods for “{node.name}”</h2>
      {node.subMethodsNote !== undefined && phase === "choose" && (
        <p className="hint" data-testid="submethods-note">
          Sub-methods note: {node.subMethodsNote}
        </p>
      )}
      {phase === "choose" && choosePhase}
      {phase === "combine" && combinePhase}
      {phase === "retention" && retentionPhase}
      {phase === "tick" && tickPhase}
      <WizardNav
        continueTestId="mixed-continue"
        continueLabel={continueLabel}
        onContinue={onContinue}
      />
      {gateMessages.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}
    </section>
  );
}
