import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The hard boundary (extension spec §6, docs/ROADMAP-V2.md §3.4): this app
 * plans evaluations, it never records what actually happened. Once rubrics
 * can change in response to live fieldwork (Phase 3), the pressure to add a
 * results/actual-value/observed-value/finding/score field becomes intense —
 * this test is the tripwire, not a style preference. It scans for the
 * vocabulary in the two places a quiet regression would land: a schema key
 * (the persisted data model) or a UI label (what the app tells the user this
 * field is for). It deliberately does NOT scan arbitrary prose/comments —
 * those already use these words constantly in legitimate explanatory text
 * (e.g. this very file), and scanning them would drown the signal.
 *
 * The allowlist is the Simulate/Case surface itself (extension spec §2,
 * docs/ROADMAP-V2.md §2.1): a SIMULATED Case's hypothetical "result" of
 * folding evidence through conditions is exactly what that feature is, and
 * is never persisted as a recorded outcome (simulateBoundary.test.ts is the
 * separate tripwire for that). Anything added to this allowlist later is a
 * decision, not a fix — record it as a Q# (CLAUDE.md).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const VOCAB = /(result|actual|observed|finding|score)/i;

const ALLOWLISTED_FILES = [
  /^src\/domain\/simulateEvaluate\.ts$/,
  /^src\/domain\/simulateEvaluate\.test\.ts$/,
  /^src\/domain\/simulateGating\.ts$/,
  /^src\/domain\/simulateGating\.test\.ts$/,
  /^src\/domain\/simCase\.ts$/,
  /^src\/domain\/simCase\.test\.ts$/,
  /^src\/views\/Simulate.*\.tsx$/,
  /^src\/views\/EvidenceValueInputs\.tsx$/,
  /^src\/views\/ConditionFireDisplay\.tsx$/,
];

function isAllowlisted(relPath: string): boolean {
  return ALLOWLISTED_FILES.some((re) => re.test(relPath));
}

describe("results-vocabulary guard — schema keys", () => {
  it("no zod object key in schema.ts uses results/actual/observed/finding/score vocabulary", () => {
    const source = readFileSync(resolve(repoRoot, "src/domain/schema.ts"), "utf8");
    const offenders: string[] = [];
    for (const line of source.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\./);
      if (match && VOCAB.test(match[1]!)) offenders.push(match[1]!);
    }
    expect(offenders).toEqual([]);
  });
});

// Deliberately narrow to elements that NAME something for the user — a field
// label, a heading, a button's own text, or a placeholder/aria-label/title
// attribute — never `<p>`/hint prose, which legitimately explains features
// in rich English and would drown in false positives (e.g. a hint that
// quotes the extension spec's own "the delta is the finding" is not a
// results field). Every pattern is anchored to a single line: JSX text
// genuinely spanning multiple lines is rare in this codebase, and allowing
// a match to cross lines risks sweeping in unrelated code/comments that
// happen to sit between an unrelated `<` and `>` (generics, comparisons).
const LABEL_PATTERNS = [
  /<(?:label|h[1-6]|button)\b[^>]*>([^<\n]+)/g,
  /(?:placeholder|aria-label|title)=["']([^"'\n]*)["']/g,
];

describe("results-vocabulary guard — UI labels", () => {
  it("no field label, heading, button text, placeholder, title, or aria-label outside the Simulate/Case surface uses that vocabulary", () => {
    const tracked = execFileSync("git", ["ls-files", "src/views"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f.endsWith(".tsx") && !isAllowlisted(f));

    const offenders: string[] = [];
    for (const rel of tracked) {
      const source = readFileSync(resolve(repoRoot, rel), "utf8");
      for (const pattern of LABEL_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const text = match[1] ?? "";
          if (VOCAB.test(text)) offenders.push(`${rel}: ${text.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist itself still matches real, tracked files (guards against a silently-renamed target)", () => {
    const tracked = execFileSync("git", ["ls-files", "src/domain", "src/views"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    for (const re of ALLOWLISTED_FILES) {
      expect(tracked.some((f) => re.test(f))).toBe(true);
    }
  });
});
