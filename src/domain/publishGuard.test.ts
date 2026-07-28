import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isBlocked, loadLeakPatterns } from "../../scripts/publishRules.mjs";

/**
 * Last line of defence for the publishing split (docs/SPEC_MAPPING.md,
 * _private/REPO-PUBLISHING.md): fails the normal `npm test` gate — not just the
 * publish step — if owner/Claude working material is git-tracked anywhere in
 * this repo instead of living in the gitignored `_private/` directory.
 *
 * Deliberately narrower than the full `.publishignore` list: `docs/`,
 * `CLAUDE.md` etc. are legitimately tracked in THIS (private) repo — only the
 * LEAK-PATTERNS block is a true leak wherever it is found.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("publish guard", () => {
  it("git tracks nothing matching the leak patterns", () => {
    const content = readFileSync(resolve(repoRoot, ".publishignore"), "utf8");
    const patterns = loadLeakPatterns(content);
    const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const offenders = tracked.filter((rel) => isBlocked(rel, patterns));
    expect(offenders).toEqual([]);
  });

  it("the leak-pattern block in .publishignore has not been silently emptied", () => {
    const content = readFileSync(resolve(repoRoot, ".publishignore"), "utf8");
    const patterns = loadLeakPatterns(content);
    expect(patterns.length).toBeGreaterThan(0);
  });
});
