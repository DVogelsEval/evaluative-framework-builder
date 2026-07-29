import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { includedRecordEntries, recordWithheldLine, toMarkdown } from "./output";
import type { EvaluationQuestion, RecordEntry } from "./schema";

/**
 * V2 record layer export scoping (docs/ROADMAP-V2.md §1.4, Q64). The withheld
 * count is the load-bearing guarantee of this whole layer: a gap the reader
 * can see is a different object from a gap they cannot (extension spec
 * decision 3). This is the test that must never be relaxed.
 */

function entry(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    id: crypto.randomUUID(),
    elementRef: "eq",
    timestamp: "2026-07-28T00:00:00.000Z",
    author: "Reviewer",
    changeSummary: "Something changed.",
    reason: "Because.",
    prompt: "other",
    includeInExport: true,
    ...overrides,
  };
}

describe("recordWithheldLine — the non-suppressible export line", () => {
  it("states total and withheld counts, singular/plural correctly", () => {
    expect(recordWithheldLine([])).toBe("Decision record: 0 entries, 0 withheld.");
    expect(recordWithheldLine([entry()])).toBe("Decision record: 1 entry, 0 withheld.");
    expect(recordWithheldLine([entry(), entry({ includeInExport: false })])).toBe(
      "Decision record: 2 entries, 1 withheld.",
    );
  });

  it("still states the count when every entry is withheld", () => {
    const all = [entry({ includeInExport: false }), entry({ includeInExport: false })];
    expect(recordWithheldLine(all)).toBe("Decision record: 2 entries, 2 withheld.");
  });
});

describe("includedRecordEntries — only these are ever listed individually", () => {
  it("filters to includeInExport: true", () => {
    const kept = entry({ changeSummary: "kept" });
    const dropped = entry({ changeSummary: "dropped", includeInExport: false });
    expect(includedRecordEntries([kept, dropped])).toEqual([kept]);
  });
});

describe("toMarkdown — the Decision record section", () => {
  function minimalDoc(records: RecordEntry[]): EvaluationQuestion {
    return {
      id: crypto.randomUUID(),
      title: "EQ",
      questionText: "How good is it?",
      schemaVersion: 5,
      mesoLayers: [
        {
          id: crypto.randomUUID(),
          kind: "criteria",
          tierOrder: 0,
          continuum: {
            id: crypto.randomUUID(),
            columns: [
              { id: "c1", label: "Weak", ordinal: 1 },
              { id: "c2", label: "Strong", ordinal: 2 },
            ],
            sufficientBarAfterOrdinal: 1,
          },
          nodes: [],
        },
      ],
      evidenceMethods: [],
      recycleBin: { deletedNodes: [] },
      records,
      simCases: [],
      critiques: [],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    };
  }

  it("omits the section entirely when there are no records", () => {
    expect(toMarkdown(minimalDoc([]))).not.toContain("Decision record");
  });

  it("includes the withheld line and lists only the included entries", () => {
    const kept = entry({ changeSummary: "Renamed a column", reason: "Clarity." });
    const withheld = entry({ changeSummary: "SECRET", includeInExport: false });
    const md = toMarkdown(minimalDoc([kept, withheld]));
    expect(md).toContain("Decision record: 2 entries, 1 withheld.");
    expect(md).toContain("Renamed a column");
    expect(md).not.toContain("SECRET");
  });

  it("shows the withheld line even when every entry is withheld", () => {
    const md = toMarkdown(minimalDoc([entry({ includeInExport: false })]));
    expect(md).toContain("Decision record: 1 entry, 1 withheld.");
  });
});

describe("guard — no export path may ever suppress the withheld line", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = [
    resolve(here, "output.ts"),
    resolve(here, "..", "views", "OutputsView.tsx"),
  ];

  it("neither the Markdown serialiser nor the print view define a suppression parameter", () => {
    // Comments legitimately discuss "non-suppressible" etc. (this file does
    // too) — strip them so the scan only sees actual code, not prose.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      // A future "hide/suppress/omit/exclude the withheld count" option is
      // exactly the regression this guard exists to catch.
      const matches = code.match(/\b(hide|suppress|omit|exclude)\w*\s*[:(]/gi) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("recordWithheldLine itself takes no options parameter", () => {
    expect(recordWithheldLine.length).toBe(1); // (records) — nothing else
  });
});
