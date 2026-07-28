import { PATTERN_COMPARATORS, STRENGTH_VALUES } from "../domain/conditionLexicon";
import { subordinateLayer } from "../domain/layers";
import { termSlotKey, type SessionInputs } from "../domain/simulateEvaluate";
import type {
  BooleanConditionNode,
  ComparisonValue,
  ConditionTerm,
  EvaluationQuestion,
} from "../domain/schema";

/**
 * The Simulate-window evidence inputs (R-SIM-2): for every element referenced by
 * a subordinate node's Boolean conditions, a control to set a **test value**.
 * These are the evidence-rubric levels the user "clicks" (owner Q61) — a method
 * strength, a clarity/count number, or an existence/pattern yes-no. Every
 * control defaults to unset ("—"); an unset value makes any condition using it
 * **unknown**, never a default rating (R-SIM-4). Nothing here is persisted.
 */

const EXISTENCE = ["exists", "does_not_exist"];

interface InputDescriptor {
  key: string; // global session key `${nodeId}::${slot}`
  label: string;
  kind: "strength" | "number" | "boolean";
  min: number;
  max?: number;
}

function collectTerms(node: BooleanConditionNode, out: ConditionTerm[]): void {
  if (node.type === "TERM") out.push(node.term);
  else if (node.type === "NOT") collectTerms(node.operand, out);
  else node.operands.forEach((op) => collectTerms(op, out));
}

function describe(nodeId: string, term: ConditionTerm): InputDescriptor {
  const slot = termSlotKey(term);
  const key = `${nodeId}::${slot}`;
  if (EXISTENCE.includes(term.comparator)) {
    return { key, label: `${term.evidenceElementLabel} exists?`, kind: "boolean", min: 0 };
  }
  if (PATTERN_COMPARATORS.includes(term.comparator)) {
    return {
      key,
      label: `${term.evidenceElementLabel} ${term.comparator === "contains" || term.comparator === "does_not_contain" ? "contains" : "shows"} “${String(term.value)}”?`,
      kind: "boolean",
      min: 0,
    };
  }
  if (typeof term.value === "number") {
    const clarity = term.evidenceElementId === "scenarioClarity";
    return {
      key,
      label: term.evidenceElementLabel,
      kind: "number",
      min: clarity ? 1 : 0,
      ...(clarity ? { max: 5 } : {}),
    };
  }
  return { key, label: term.evidenceElementLabel, kind: "strength", min: 0 };
}

export function EvidenceValueInputs({
  doc,
  inputs,
  onChange,
}: {
  doc: EvaluationQuestion;
  inputs: SessionInputs;
  onChange: (key: string, value: ComparisonValue | undefined) => void;
}) {
  const layer = subordinateLayer(doc);
  if (!layer) return null;

  return (
    <div className="sim-inputs" data-testid="sim-inputs">
      <h3>Set the level each piece of evidence reached</h3>
      <p className="hint">
        These are hypothetical test values — pick what each element would show, and watch
        the framework resolve. Leave any as “—” to see how an unknown propagates.
      </p>
      {[...layer.nodes]
        .sort((a, b) => a.order - b.order)
        .map((node) => {
          // Distinct controls this node's conditions reference.
          const bySlot = new Map<string, InputDescriptor>();
          for (const cell of node.cells) {
            const root =
              cell.condition?.mode === "boolean" ? cell.condition.booleanLogic?.root : undefined;
            if (!root) continue;
            const terms: ConditionTerm[] = [];
            collectTerms(root, terms);
            for (const term of terms) {
              const d = describe(node.id, term);
              if (!bySlot.has(d.key)) bySlot.set(d.key, d);
            }
          }
          const descriptors = [...bySlot.values()];
          if (descriptors.length === 0) return null;
          return (
            <fieldset key={node.id} className="sim-node-inputs" data-testid={`sim-node-${node.order}`}>
              <legend>{node.name || "(unnamed)"}</legend>
              {descriptors.map((d, i) => (
                <label key={d.key} className="sim-input-row">
                  <span className="sim-input-label">{d.label}</span>
                  <Control
                    descriptor={d}
                    value={inputs[d.key]}
                    onChange={(v) => onChange(d.key, v)}
                    testId={`sim-input-${node.order}-${i}`}
                  />
                </label>
              ))}
            </fieldset>
          );
        })}
    </div>
  );
}

function Control({
  descriptor,
  value,
  onChange,
  testId,
}: {
  descriptor: InputDescriptor;
  value: ComparisonValue | undefined;
  onChange: (value: ComparisonValue | undefined) => void;
  testId: string;
}) {
  if (descriptor.kind === "strength") {
    return (
      <select
        data-testid={testId}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as ComparisonValue))}
      >
        <option value="">—</option>
        {STRENGTH_VALUES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  if (descriptor.kind === "number") {
    return (
      <input
        type="number"
        data-testid={testId}
        min={descriptor.min}
        max={descriptor.max}
        value={typeof value === "number" ? value : ""}
        placeholder="—"
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }
  return (
    <select
      data-testid={testId}
      value={value === true ? "yes" : value === false ? "no" : ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value === "yes")
      }
    >
      <option value="">—</option>
      <option value="yes">yes</option>
      <option value="no">no</option>
    </select>
  );
}
