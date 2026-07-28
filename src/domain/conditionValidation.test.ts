import { describe, expect, it } from "vitest";
import { parse, validate } from "./BooleanParser";
import type { EvidenceElement } from "./conditionLexicon";

const elements: EvidenceElement[] = [
  { id: "Method A", label: "[Method A]", classes: ["strength", "pattern"] },
  { id: "Method B", label: "[Method B]", classes: ["strength", "pattern"] },
];

const validateInput = (input: string) => validate(parse(input).root, elements);

describe("condition validation (R-COND-9, CONDITION-LEXICON §J)", () => {
  it("passes a well-formed condition referencing present elements", () => {
    const { errors, warnings } = validateInput(
      "[Method A] is Strong and [Method B] is at or above Good",
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("warns when a referenced element is not on this node", () => {
    const { warnings } = validateInput("[Method Z] is Strong");
    expect(warnings.some((w) => w.includes("[Method Z]"))).toBe(true);
  });

  it("errors on an always-false contradiction (X and not-X form)", () => {
    const { errors } = validateInput("[Method A] is Strong and [Method A] is not Strong");
    expect(errors.some((e) => e.includes("never be true"))).toBe(true);
  });

  it("errors on an always-false condition using an explicit not", () => {
    const { errors } = validateInput("[Method A] is Strong and not ([Method A] is Strong)");
    expect(errors.some((e) => e.includes("never be true"))).toBe(true);
  });

  it("warns on an always-true tautology (X or not-X form)", () => {
    const { warnings } = validateInput("[Method A] is Strong or [Method A] is not Strong");
    expect(warnings.some((w) => w.includes("always true"))).toBe(true);
  });

  it("treats complementary threshold comparators as opposites", () => {
    // 'is at or above Good' and 'is below Good' cannot both hold.
    const { errors } = validateInput(
      "[Method A] is at or above Good and [Method A] is below Good",
    );
    expect(errors.some((e) => e.includes("never be true"))).toBe(true);
  });

  it("does not flag distinct terms on the same element", () => {
    const { errors, warnings } = validateInput(
      "[Method A] is Strong and [Method B] is Developing",
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
