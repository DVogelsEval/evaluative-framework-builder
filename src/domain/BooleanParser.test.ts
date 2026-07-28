import { describe, expect, it } from "vitest";
import {
  astToFlat,
  buildBooleanTree,
  flatToAst,
  parse,
  toPlainEnglish,
  tokenize,
} from "./BooleanParser";
import type { EvidenceElement } from "./conditionLexicon";
import type { BooleanConditionNode, ConditionTerm } from "./schema";

const term = (
  label: string,
  comparator: ConditionTerm["comparator"],
  value: ConditionTerm["value"],
): BooleanConditionNode => ({
  type: "TERM",
  term: {
    evidenceElementId: label.replace(/[[\]]/g, ""),
    evidenceElementLabel: label,
    comparator,
    value,
    valueLabel: value === null ? "" : String(value),
  },
});

describe("tokenize (R-COND-9)", () => {
  it("lexes a two-term AND with a multi-word comparator", () => {
    const { tokens, errors } = tokenize("[Method A] is Strong and [Method B] is at or above Good");
    expect(errors).toEqual([]);
    expect(tokens).toEqual([
      { t: "element", raw: "Method A" },
      { t: "comparator", value: "is" },
      { t: "value", value: "Strong" },
      { t: "and" },
      { t: "element", raw: "Method B" },
      { t: "comparator", value: "is_at_or_above" },
      { t: "value", value: "Good" },
    ]);
  });

  it("does not mistake the 'Not Yet' value for the 'not' operator", () => {
    const { tokens, errors } = tokenize("[Method A] is Not Yet");
    expect(errors).toEqual([]);
    expect(tokens).toEqual([
      { t: "element", raw: "Method A" },
      { t: "comparator", value: "is" },
      { t: "value", value: "Not Yet" },
    ]);
  });

  it("records an unknown comparator as an error but keeps lexing", () => {
    const { errors } = tokenize("[Method A] xyz Good");
    expect(errors.some((e) => e.includes("Unknown keyword 'xyz'"))).toBe(true);
  });
});

describe("parse — structure & precedence (R-COND-9)", () => {
  it("parses a valid two-term condition without error", () => {
    const { root, errors } = parse("[Method A] is Strong and [Method B] is at or above Good");
    expect(errors).toEqual([]);
    expect(root).toEqual({
      type: "AND",
      operands: [
        term("[Method A]", "is", "Strong"),
        term("[Method B]", "is_at_or_above", "Good"),
      ],
    });
  });

  it("binds 'and' tighter than 'or' (not > and > or)", () => {
    const { root } = parse("[A] is Strong and [B] is Strong or [C] exists");
    expect(root).toEqual({
      type: "OR",
      operands: [
        { type: "AND", operands: [term("[A]", "is", "Strong"), term("[B]", "is", "Strong")] },
        term("[C]", "exists", null),
      ],
    });
  });

  it("parses a negated parenthesised clause", () => {
    const { root, errors } = parse("not ([Scenario Clarity] is below 3)");
    expect(errors).toEqual([]);
    expect(root).toEqual({
      type: "NOT",
      operand: term("[Scenario Clarity]", "is_below", 3),
    });
  });

  it("reports an unmatched opening parenthesis", () => {
    const { errors } = parse("([Method A] is Strong");
    expect(errors.some((e) => e.includes("Unmatched opening parenthesis"))).toBe(true);
  });

  it("reports a missing value after a comparator", () => {
    const { errors } = parse("[Method A] is at or above");
    expect(errors.some((e) => e.includes("Value required"))).toBe(true);
  });

  it("reports a missing comparator", () => {
    const { errors } = parse("[Method A] Strong");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("toPlainEnglish — canonical rendering (R-COND-10)", () => {
  it("round-trips a condition to identical plain English", () => {
    const input = "[Method A] is Strong and [Method B] is at or above Good";
    expect(toPlainEnglish(parse(input).root)).toBe(input);
  });

  it("parenthesises a lower-precedence OR nested inside an AND", () => {
    const root: BooleanConditionNode = {
      type: "AND",
      operands: [
        term("[A]", "is", "Strong"),
        { type: "OR", operands: [term("[B]", "is", "Strong"), term("[C]", "exists", null)] },
      ],
    };
    expect(toPlainEnglish(root)).toBe("[A] is Strong and ([B] is Strong or [C] exists)");
  });

  it("always wraps a not operand", () => {
    expect(toPlainEnglish({ type: "NOT", operand: term("[A]", "shows", "contradiction") })).toBe(
      "not ([A] shows contradiction)",
    );
  });
});

describe("flat editing model (astToFlat / flatToAst)", () => {
  it("round-trips a single-operator list of terms and negated terms", () => {
    const root: BooleanConditionNode = {
      type: "AND",
      operands: [
        term("[A]", "is", "Strong"),
        { type: "NOT", operand: term("[B]", "shows", "contradiction") },
      ],
    };
    const flat = astToFlat(root);
    expect(flat).toEqual({
      op: "AND",
      items: [
        { negated: false, term: (term("[A]", "is", "Strong") as { term: unknown }).term },
        {
          negated: true,
          term: (term("[B]", "shows", "contradiction") as { term: unknown }).term,
        },
      ],
    });
    expect(flatToAst(flat!)).toEqual(root);
  });

  it("wraps a single term as a one-item AND list", () => {
    expect(astToFlat(term("[A]", "is", "Strong"))).toEqual({
      op: "AND",
      items: [{ negated: false, term: (term("[A]", "is", "Strong") as { term: unknown }).term }],
    });
  });

  it("returns null for a nested condition that the flat model can't hold", () => {
    const root: BooleanConditionNode = {
      type: "AND",
      operands: [
        term("[A]", "is", "Strong"),
        { type: "OR", operands: [term("[B]", "is", "Strong"), term("[C]", "exists", null)] },
      ],
    };
    expect(astToFlat(root)).toBeNull();
  });
});

describe("buildBooleanTree — click-built and typed conditions store identically", () => {
  const elements: EvidenceElement[] = [
    { id: "Method A", label: "[Method A]", classes: ["strength", "pattern"] },
    { id: "Method B", label: "[Method B]", classes: ["strength", "pattern"] },
  ];

  it("produces canonical plain English with no errors for a clean tree", () => {
    const root: BooleanConditionNode = {
      type: "AND",
      operands: [
        term("[Method A]", "is", "Strong"),
        term("[Method B]", "is_at_or_above", "Good"),
      ],
    };
    const tree = buildBooleanTree(root, elements);
    expect(tree.plainEnglish).toBe("[Method A] is Strong and [Method B] is at or above Good");
    expect(tree.errors).toBeUndefined();
    expect(tree.warnings).toBeUndefined();
  });
});
