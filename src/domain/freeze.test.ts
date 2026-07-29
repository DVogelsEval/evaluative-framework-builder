import { describe, expect, it } from "vitest";
import { createEvaluationQuestion } from "./factory";
import { canonicalise, freezeHash } from "./freeze";
import type { RecordEntry } from "./schema";

const entry = (overrides: Partial<RecordEntry> = {}): RecordEntry => ({
  id: crypto.randomUUID(),
  elementRef: "eq",
  timestamp: "2026-07-28T00:00:00.000Z",
  author: "A",
  changeSummary: "X",
  reason: "Y",
  prompt: "other",
  includeInExport: true,
  ...overrides,
});

describe("canonicalise — deterministic, excludes updatedAt/recycleBin/future records", () => {
  it("is stable across an autosave-only change to updatedAt", () => {
    const doc = createEvaluationQuestion("EQ");
    const a = canonicalise(doc);
    doc.updatedAt = "2099-01-01T00:00:00.000Z";
    const b = canonicalise(doc);
    expect(a).toBe(b);
  });

  it("excludes the recycleBin's content", () => {
    const doc = createEvaluationQuestion("EQ");
    const before = canonicalise(doc);
    doc.recycleBin.deletedNodes.push({
      node: { anything: "here" },
      deletedAt: "2026-07-28T00:00:00.000Z",
      originPath: "records",
    });
    expect(canonicalise(doc)).toBe(before);
  });

  it("drops any RecordEntry timestamped after the freeze moment", () => {
    const doc = createEvaluationQuestion("EQ");
    const at = "2026-07-28T12:00:00.000Z";
    const before = entry({ timestamp: "2026-07-28T00:00:00.000Z", changeSummary: "before" });
    const after = entry({ timestamp: "2026-07-28T23:59:59.000Z", changeSummary: "after" });
    doc.records = [before, after];
    const canonical = canonicalise(doc, at);
    expect(canonical).toContain("before");
    expect(canonical).not.toContain("after");
  });

  it("normalises trailing whitespace, CRLF, and Unicode form on every string", () => {
    const docA = createEvaluationQuestion("EQ");
    docA.questionText = "How good is it?  \r\ntruly";
    // Same document (same UUIDs throughout) — only questionText's literal
    // form differs, everything else must line up exactly.
    const docB = structuredClone(docA);
    docB.questionText = "How good is it?\ntruly";
    expect(canonicalise(docA)).toBe(canonicalise(docB));
  });
});

describe("freezeHash — SHA-256 over the canonical form", () => {
  it("freezing the same unchanged framework twice produces an identical hash", async () => {
    const doc = createEvaluationQuestion("EQ");
    const first = await freezeHash(doc);
    doc.updatedAt = new Date(Date.now() + 60_000).toISOString(); // simulate a later autosave
    const second = await freezeHash(doc);
    expect(first).toBe(second);
  });

  it("produces a 64-character lowercase hex digest", async () => {
    const doc = createEvaluationQuestion("EQ");
    const hash = await freezeHash(doc);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the actual content changes", async () => {
    const doc = createEvaluationQuestion("EQ");
    const before = await freezeHash(doc);
    doc.title = "A different title";
    const after = await freezeHash(doc);
    expect(before).not.toBe(after);
  });
});
