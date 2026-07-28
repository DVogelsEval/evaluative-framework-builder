import { describe, expect, it } from "vitest";
import { stableStringify } from "./serialize";

describe("stableStringify — git-diffable on-disk format (ARCHITECTURE §3)", () => {
  it("orders object keys deterministically regardless of insertion order", () => {
    const a = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = stableStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("preserves array order", () => {
    expect(JSON.parse(stableStringify({ list: [3, 1, 2] }))).toEqual({ list: [3, 1, 2] });
  });

  it("pretty-prints with two-space indentation", () => {
    expect(stableStringify({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
