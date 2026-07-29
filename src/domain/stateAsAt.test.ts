import { describe, expect, it } from "vitest";
import { createEvaluationQuestion } from "./factory";
import {
  buildStateAsAtMarkdown,
  previousStateAsAtMarker,
  recordsSinceLastExport,
  STATE_AS_AT_MARKER_SUMMARY,
} from "./stateAsAt";
import type { RecordEntry } from "./schema";

function entry(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    id: crypto.randomUUID(),
    elementRef: "eq",
    timestamp: "2026-07-01T00:00:00.000Z",
    author: "Dana",
    changeSummary: "Something changed.",
    reason: "Because.",
    prompt: "other",
    includeInExport: true,
    ...overrides,
  };
}

describe("previousStateAsAtMarker — finds the boundary RecordEntry, no separate export log", () => {
  it("returns undefined when no marker exists", () => {
    const doc = createEvaluationQuestion("EQ");
    expect(previousStateAsAtMarker(doc)).toBeUndefined();
  });

  it("ignores ordinary records and other prompts, matching only the exact marker shape", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [
      entry({ id: "1", changeSummary: "State-as-at export", prompt: "freeze" }), // wrong prompt
      entry({ id: "2", changeSummary: "Something else", prompt: "other" }), // wrong summary
    ];
    expect(previousStateAsAtMarker(doc)).toBeUndefined();
  });

  it("picks the most recent marker when several exist", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [
      entry({
        id: "older",
        changeSummary: STATE_AS_AT_MARKER_SUMMARY,
        timestamp: "2026-07-01T00:00:00.000Z",
      }),
      entry({
        id: "newer",
        changeSummary: STATE_AS_AT_MARKER_SUMMARY,
        timestamp: "2026-07-15T00:00:00.000Z",
      }),
    ];
    expect(previousStateAsAtMarker(doc)?.id).toBe("newer");
  });
});

describe("recordsSinceLastExport — the delta window", () => {
  it("returns every record when there is no previous marker", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [entry({ id: "1" }), entry({ id: "2" })];
    expect(recordsSinceLastExport(doc).map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("excludes the marker itself and everything at-or-before it, newest first", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [
      entry({ id: "before", timestamp: "2026-07-01T00:00:00.000Z" }),
      entry({
        id: "marker",
        changeSummary: STATE_AS_AT_MARKER_SUMMARY,
        timestamp: "2026-07-10T00:00:00.000Z",
      }),
      entry({ id: "after-1", timestamp: "2026-07-11T00:00:00.000Z" }),
      entry({ id: "after-2", timestamp: "2026-07-20T00:00:00.000Z" }),
    ];
    expect(recordsSinceLastExport(doc).map((r) => r.id)).toEqual(["after-2", "after-1"]);
  });

  it("includes withheld entries so the unsuppressible count still sees them", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [entry({ id: "1", includeInExport: false })];
    expect(recordsSinceLastExport(doc)).toHaveLength(1);
  });
});

describe("buildStateAsAtMarkdown — the delta-first export (docs/ROADMAP-V2.md §3.3)", () => {
  it("leads with 'What changed' before the current framework section", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.title = "Reading program quality";
    doc.records = [entry({ changeSummary: "Tightened the Weak condition." })];
    const md = buildStateAsAtMarkdown(doc);
    const changedAt = md.indexOf("## What changed");
    const frameworkAt = md.indexOf("## The framework as it currently stands");
    expect(changedAt).toBeGreaterThan(-1);
    expect(frameworkAt).toBeGreaterThan(changedAt);
    expect(md).toContain("Tightened the Weak condition.");
  });

  it("never lists itself: the delta window is empty right after the caller writes the marker", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [
      entry({ changeSummary: "Earlier change." }),
      entry({ changeSummary: STATE_AS_AT_MARKER_SUMMARY, timestamp: "2026-07-28T00:00:00.000Z" }),
    ];
    const md = buildStateAsAtMarkdown(doc);
    expect(md).toContain("_Nothing recorded in this window._");
    expect(md).not.toContain("Earlier change.");
  });

  it("carries the unsuppressible withheld count for the window, and never duplicates the whole-history Decision record section", () => {
    const doc = createEvaluationQuestion("EQ");
    doc.records = [entry({ includeInExport: false })];
    const md = buildStateAsAtMarkdown(doc);
    expect(md).toContain("Decision record: 1 entry, 1 withheld.");
    expect(md.match(/## Decision record/g)).toBeNull();
  });
});
