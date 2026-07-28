import { describe, expect, it } from "vitest";
import {
  addColumn,
  negativeColumns,
  positiveColumns,
  removeColumn,
  seedHeadersFromValueLanguage,
  sideOf,
} from "./continuum";
import { createMinimalContinuum, createValueSpan } from "./factory";
import { checkContinuum } from "./invariants";

describe("continuum sides — derived from the bar (R-039)", () => {
  it("splits a 1+1 continuum into one negative and one positive column", () => {
    const c = createMinimalContinuum();
    expect(negativeColumns(c)).toHaveLength(1);
    expect(positiveColumns(c)).toHaveLength(1);
    expect(sideOf(c, negativeColumns(c)[0]!.id)).toBe("negative");
    expect(sideOf(c, positiveColumns(c)[0]!.id)).toBe("positive");
  });
});

describe("addColumn — unequal sides allowed (R-040/R-041)", () => {
  it("adds to the positive side without disturbing existing columns", () => {
    let c = createMinimalContinuum();
    c.columns[0]!.label = "Below";
    c.columns[1]!.label = "Above";
    c = addColumn(c, "positive");
    expect(positiveColumns(c)).toHaveLength(2);
    expect(negativeColumns(c)).toHaveLength(1);
    // existing labels survive; the new far-right column is blank
    expect(negativeColumns(c)[0]!.label).toBe("Below");
    expect(positiveColumns(c)[0]!.label).toBe("Above");
    expect(positiveColumns(c).at(-1)!.label).toBe("");
    // ordinals stay contiguous and the bar stays consistent
    expect(checkContinuum(c)).toEqual([]);
    expect(c.sufficientBarAfterOrdinal).toBe(1);
  });

  it("adds to the negative side at the far-left extreme", () => {
    let c = createMinimalContinuum();
    c.columns[0]!.label = "Below";
    c.columns[1]!.label = "Above";
    c = addColumn(c, "negative");
    expect(negativeColumns(c)).toHaveLength(2);
    expect(negativeColumns(c).at(-1)!.label).toBe("Below"); // core column stays by the bar
    expect(negativeColumns(c)[0]!.label).toBe(""); // new extreme
    expect(c.sufficientBarAfterOrdinal).toBe(2);
    expect(checkContinuum(c)).toEqual([]);
  });
});

describe("removeColumn — never below one per side (R-158/Q7, GWT-2.4)", () => {
  it("refuses to delete the last column on a side", () => {
    const c = createMinimalContinuum();
    const posId = positiveColumns(c)[0]!.id;
    const result = removeColumn(c, posId);
    expect(result.removed).toBe(false);
    expect(result.message).toMatch(/positive side/);
    expect(result.continuum).toBe(c); // unchanged
  });

  it("removes a column when the side still has one left", () => {
    let c = createMinimalContinuum();
    c = addColumn(c, "positive"); // now 1 neg + 2 pos
    const removeId = positiveColumns(c)[0]!.id;
    const result = removeColumn(c, removeId);
    expect(result.removed).toBe(true);
    expect(positiveColumns(result.continuum)).toHaveLength(1);
    expect(checkContinuum(result.continuum)).toEqual([]);
  });
});

describe("seedHeadersFromValueLanguage — Q34", () => {
  it("fills empty positive headers from spans, bar-outward, without clobbering", () => {
    let c = createMinimalContinuum();
    c = addColumn(c, "positive"); // 1 neg + 2 pos, all blank
    const spans = [createValueSpan(0, 4, "good"), createValueSpan(9, 18, "excellent")];
    const seeded = seedHeadersFromValueLanguage(c, spans);
    const pos = positiveColumns(seeded);
    expect(pos[0]!.label).toBe("good"); // just above the bar
    expect(pos[1]!.label).toBe("excellent"); // further out
    expect(negativeColumns(seeded)[0]!.label).toBe(""); // negatives untouched
  });

  it("leaves already-authored headers alone and ignores empty spans", () => {
    const c = createMinimalContinuum();
    positiveColumns(c)[0]!.label = "Sufficient";
    const seeded = seedHeadersFromValueLanguage(c, [createValueSpan(0, 3, "   ")]);
    expect(positiveColumns(seeded)[0]!.label).toBe("Sufficient");
  });

  it("is a no-op with no spans", () => {
    const c = createMinimalContinuum();
    expect(seedHeadersFromValueLanguage(c, [])).toBe(c);
  });
});
