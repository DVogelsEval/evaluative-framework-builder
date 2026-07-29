import { describe, expect, it } from "vitest";
import { hasExpectedFailureCase, SIMULATED_LABEL } from "./simCase";
import type { SimCase } from "./schema";

const aCase = (overrides: Partial<SimCase> = {}): SimCase => ({
  id: crypto.randomUUID(),
  label: "Case",
  prose: "A vignette.",
  values: {},
  ...overrides,
});

describe("SIMULATED_LABEL", () => {
  it("is the fixed string every SimCase rendering must carry", () => {
    expect(SIMULATED_LABEL).toBe("SIMULATED");
  });
});

describe("hasExpectedFailureCase", () => {
  it("is false for an empty set", () => {
    expect(hasExpectedFailureCase([])).toBe(false);
  });

  it("is false when no case is marked expectedToFail", () => {
    expect(hasExpectedFailureCase([aCase(), aCase({ expectedToFail: false })])).toBe(false);
  });

  it("is true once at least one case is marked expectedToFail", () => {
    expect(hasExpectedFailureCase([aCase(), aCase({ expectedToFail: true })])).toBe(true);
  });
});
