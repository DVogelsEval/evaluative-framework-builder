import { useState } from "react";
import {
  astToFlat,
  buildBooleanTree,
  flatToAst,
  parse,
  validate,
  type FlatCondition,
} from "../domain/BooleanParser";
import type { EvidenceElement } from "../domain/conditionLexicon";
import type { ConditionTerm, RubricCellCondition, WarrantType } from "../domain/schema";
import { WARRANT_SOURCE_PROMPTS, WARRANT_TYPE_LABELS } from "../domain/warrant";
import { ConditionModal, type JoinOp } from "./ConditionModal";
import { ConditionTermToken } from "./ConditionTermToken";

type ModalState = { kind: "add" } | { kind: "edit"; index: number } | null;

/**
 * The reusable Boolean-condition editor (R-COND-2/6/9/10). It renders a
 * condition as a clickable token chain, offers click add/edit/delete plus a
 * typed escape hatch that runs the parser, and holds the defeasible qualifiers.
 * It is storage-agnostic: `condition` is the current value and `onChange` saves
 * the next one (or `null` to clear) — so the same editor drives a criterion
 * rubric cell (`BooleanEditor`) and an Overall-Judgement column
 * (`JudgementConditionEditor`, Slice 14). `elements` scopes what the term modal
 * offers (methods for a criterion, node conclusions for the synthesis, §B.7).
 *
 * One `+ Add condition` button (Q74/D6): the join word and a term's negation
 * are chosen inside the modal, not by separate add-and/add-or/add-not buttons.
 * The underlying model is still a single-join flat chain — changing the join
 * word changes it for every term in the chain, which the modal states plainly
 * rather than hiding. Nesting stays reachable only via the typed escape hatch.
 */
export function ConditionLogicEditor({
  elements,
  condition,
  onChange,
  testId,
}: {
  elements: EvidenceElement[];
  condition: RubricCellCondition | undefined;
  onChange: (condition: RubricCellCondition | null) => void;
  testId: string;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [typed, setTyped] = useState("");
  const [typedErrors, setTypedErrors] = useState<string[]>([]);
  const [showTyped, setShowTyped] = useState(false);

  const root = condition?.booleanLogic?.root ?? null;
  const flat: FlatCondition | null = root ? astToFlat(root) : { op: "AND", items: [] };

  const patch = (partial: Partial<RubricCellCondition>) => {
    const base: RubricCellCondition = condition ?? {
      mode: "boolean",
      lastModified: new Date().toISOString(),
    };
    onChange({
      ...base,
      ...partial,
      mode: "boolean",
      lastModified: new Date().toISOString(),
    });
  };

  const commit = (next: FlatCondition) => {
    if (next.items.length === 0) {
      patch({ booleanLogic: undefined });
      return;
    }
    patch({ booleanLogic: buildBooleanTree(flatToAst(next), elements) });
  };

  const onModalSave = (term: ConditionTerm, opts: { negated: boolean; joinOp: JoinOp }) => {
    const current = flat ?? { op: "AND" as const, items: [] };
    if (modal?.kind === "edit") {
      const items = current.items.map((it, i) =>
        i === modal.index ? { term, negated: opts.negated } : it,
      );
      commit({ op: opts.joinOp, items });
    } else {
      commit({ op: opts.joinOp, items: [...current.items, { negated: opts.negated, term }] });
    }
    setModal(null);
  };

  const onModalDelete = () => {
    if (modal?.kind !== "edit" || !flat) {
      setModal(null);
      return;
    }
    commit({ ...flat, items: flat.items.filter((_, i) => i !== modal.index) });
    setModal(null);
  };

  const applyTyped = () => {
    const result = parse(typed);
    const asFlat = astToFlat(result.root);
    const semantic = validate(result.root, elements);
    const errors = [...result.errors];
    if (!asFlat && result.errors.length === 0) {
      errors.push("This condition is too nested to edit as terms — simplify it.");
    }
    setTypedErrors([...errors, ...semantic.warnings]);
    if (errors.length === 0 && asFlat) {
      commit(asFlat);
      setTyped("");
      setShowTyped(false);
      setTypedErrors([]);
    }
  };

  const initialTerm = (): ConditionTerm | null =>
    modal?.kind === "edit" && flat ? (flat.items[modal.index]?.term ?? null) : null;

  const storedWarnings = condition?.booleanLogic?.warnings ?? [];
  const storedErrors = condition?.booleanLogic?.errors ?? [];

  return (
    <div className="bool-editor" data-testid={testId}>
      {flat === null ? (
        <div className="cond-complex">
          <p className="hint">
            This condition is more nested than the term editor shows. Its plain English:
          </p>
          <p className="cond-plain" data-testid={`${testId}-plain`}>
            {condition?.booleanLogic?.plainEnglish}
          </p>
          <button type="button" className="secondary" onClick={() => patch({ booleanLogic: undefined })}>
            Clear and rebuild
          </button>
        </div>
      ) : (
        <>
          <div className="cond-chain" data-testid={`${testId}-chain`}>
            {flat.items.length === 0 ? (
              <span className="hint">No condition yet — add a term below.</span>
            ) : (
              flat.items.map((item, i) => (
                <span key={i} className="cond-chain-item">
                  {i > 0 && <span className="cond-op cond-op-join">{flat.op.toLowerCase()}</span>}
                  <ConditionTermToken
                    item={item}
                    index={i}
                    onEdit={(index) => setModal({ kind: "edit", index })}
                    onDelete={(index) =>
                      commit({ ...flat, items: flat.items.filter((_, j) => j !== index) })
                    }
                    testId={`${testId}-term-${i}`}
                  />
                </span>
              ))
            )}
          </div>

          <div className="cond-add-row">
            <button
              type="button"
              data-testid={`${testId}-add-term`}
              onClick={() => setModal({ kind: "add" })}
            >
              + Add condition
            </button>
          </div>
        </>
      )}

      {(storedWarnings.length > 0 || storedErrors.length > 0) && (
        <div className="cond-notes" data-testid={`${testId}-notes`}>
          {storedErrors.map((e) => (
            <p role="alert" className="error" key={e}>
              {e}
            </p>
          ))}
          {storedWarnings.map((w) => (
            <p className="warning" key={w}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <details
        className="cond-typed"
        open={showTyped}
        onToggle={(e) => setShowTyped((e.target as HTMLDetailsElement).open)}
      >
        <summary>Type a condition instead</summary>
        <textarea
          rows={2}
          data-testid={`${testId}-typed`}
          placeholder='e.g. [Method A] is Strong and [Method B] is at or above Good'
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="button" data-testid={`${testId}-typed-apply`} onClick={applyTyped}>
          Apply
        </button>
        {typedErrors.map((msg) => (
          <p role="alert" className="error" key={msg} data-testid={`${testId}-typed-error`}>
            {msg}
          </p>
        ))}
      </details>

      <Qualifiers condition={condition} onPatch={patch} testId={testId} />

      {modal && elements.length > 0 && (
        <ConditionModal
          elements={elements}
          initial={initialTerm()}
          showJoin={
            modal.kind === "edit" ? (flat?.items.length ?? 0) >= 2 : (flat?.items.length ?? 0) >= 1
          }
          initialJoinOp={flat?.op ?? "AND"}
          initialNegated={
            modal.kind === "edit" ? (flat?.items[modal.index]?.negated ?? false) : false
          }
          onSave={onModalSave}
          onCancel={() => setModal(null)}
          onDelete={modal.kind === "edit" ? onModalDelete : undefined}
        />
      )}
    </div>
  );
}

/** The optional defeasible qualifiers (R-COND-6): Typically when / Unless /
 *  Exception (each with an action) and a free-text warrant. Stored as prose. */
function Qualifiers({
  condition,
  onPatch,
  testId,
}: {
  condition: RubricCellCondition | undefined;
  onPatch: (partial: Partial<RubricCellCondition>) => void;
  testId: string;
}) {
  const typically = typeof condition?.typicallyWhen === "string" ? condition.typicallyWhen : "";
  const unlessCond =
    typeof condition?.unless?.condition === "string" ? condition.unless.condition : "";
  const exceptionCond =
    typeof condition?.exception?.condition === "string" ? condition.exception.condition : "";

  return (
    <details className="cond-qualifiers">
      <summary>Defeasible qualifiers (optional)</summary>

      <label className="cond-field">
        <span>Typically when</span>
        <input
          type="text"
          data-testid={`${testId}-typically`}
          value={typically}
          onChange={(e) => onPatch({ typicallyWhen: e.target.value || undefined })}
        />
      </label>

      <div className="cond-qualifier-row">
        <label className="cond-field">
          <span>Unless</span>
          <input
            type="text"
            data-testid={`${testId}-unless`}
            value={unlessCond}
            onChange={(e) =>
              onPatch(
                e.target.value === ""
                  ? { unless: undefined }
                  : {
                      unless: {
                        condition: e.target.value,
                        action: condition?.unless?.action ?? "suggest_weaker",
                      },
                    },
              )
            }
          />
        </label>
        <label className="cond-field">
          <span>Action</span>
          <select
            data-testid={`${testId}-unless-action`}
            value={condition?.unless?.action ?? "suggest_weaker"}
            disabled={unlessCond === ""}
            onChange={(e) =>
              onPatch({
                unless: {
                  condition: unlessCond,
                  action: e.target.value as "suggest_weaker" | "downgrade" | "block",
                },
              })
            }
          >
            <option value="suggest_weaker">suggest weaker</option>
            <option value="downgrade">downgrade</option>
            <option value="block">block</option>
          </select>
        </label>
      </div>

      <div className="cond-qualifier-row">
        <label className="cond-field">
          <span>Exception</span>
          <input
            type="text"
            data-testid={`${testId}-exception`}
            value={exceptionCond}
            onChange={(e) =>
              onPatch(
                e.target.value === ""
                  ? { exception: undefined }
                  : {
                      exception: {
                        condition: e.target.value,
                        action: condition?.exception?.action ?? "block",
                      },
                    },
              )
            }
          />
        </label>
        <label className="cond-field">
          <span>Action</span>
          <select
            data-testid={`${testId}-exception-action`}
            value={condition?.exception?.action ?? "block"}
            disabled={exceptionCond === ""}
            onChange={(e) =>
              onPatch({
                exception: {
                  condition: exceptionCond,
                  action: e.target.value as "block" | "reconsider",
                },
              })
            }
          >
            <option value="block">block</option>
            <option value="reconsider">reconsider</option>
          </select>
        </label>
      </div>

      <WarrantField condition={condition} onPatch={onPatch} testId={testId} />
    </details>
  );
}

/**
 * The warrant typology (V2 extension spec §3.1; Q63): choosing the type is the
 * methodological act, so it happens FIRST — the free-text warrant field (and
 * the `source` field) are `disabled` until a type is chosen, not merely hidden.
 * Neutral order, no ranking or colour-coding of the five types.
 */
function WarrantField({
  condition,
  onPatch,
  testId,
}: {
  condition: RubricCellCondition | undefined;
  onPatch: (partial: Partial<RubricCellCondition>) => void;
  testId: string;
}) {
  const warrant = condition?.warrant;
  const type = warrant?.type ?? null;
  const source = warrant?.source ?? "";
  const text = warrant?.text ?? "";
  const locked = type === null;

  const patchWarrant = (partial: Partial<{ type: WarrantType | null; source: string; text: string }>) => {
    const next = { type, source, text, ...partial };
    if (next.type === null && next.source === "" && next.text === "") {
      onPatch({ warrant: undefined });
      return;
    }
    onPatch({ warrant: next });
  };

  return (
    <div className="cond-warrant">
      <label className="cond-field">
        <span>Warrant type</span>
        <select
          data-testid={`${testId}-warrant-type`}
          value={type ?? ""}
          onChange={(e) =>
            patchWarrant({ type: (e.target.value || null) as WarrantType | null })
          }
        >
          <option value="">(choose a type)</option>
          {(Object.keys(WARRANT_TYPE_LABELS) as WarrantType[]).map((t) => (
            <option key={t} value={t}>
              {WARRANT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="cond-field">
        <span>{type ? WARRANT_SOURCE_PROMPTS[type] : "Source"}</span>
        <input
          type="text"
          disabled={locked}
          data-testid={`${testId}-warrant-source`}
          value={source}
          onChange={(e) => patchWarrant({ source: e.target.value })}
        />
      </label>

      <label className="cond-field">
        <span>Rationale (why this logic?)</span>
        <textarea
          rows={2}
          disabled={locked}
          data-testid={`${testId}-warrant-text`}
          value={text}
          onChange={(e) => patchWarrant({ text: e.target.value })}
        />
      </label>
    </div>
  );
}
