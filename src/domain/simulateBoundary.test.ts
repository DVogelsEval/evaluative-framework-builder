import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for Slice-14 boundary #1 (owner Q60/Q61): `simulateEvaluate.ts` is
 * the one place in the app permitted to *execute* a Boolean condition, and it
 * must never be reachable from the save/export/persistence paths — otherwise a
 * simulated, throwaway value could leak into a saved document or an export.
 *
 * This walks the **transitive** relative-import graph from each sensitive entry
 * point and fails loudly if `simulateEvaluate` is reachable from any of them.
 * Treat a failure here as a real defect, not a test to relax: it means someone
 * wired the sandbox evaluator into the real flow.
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..");

/** The paths that must not be able to reach the evaluator. */
const SENSITIVE_ENTRIES = [
  "store/store.ts",
  "persistence/local.ts", // autosave
  "domain/output.ts", // Markdown / CSV export serialiser
  "domain/serialize.ts", // JSON (.evalq.json) serialiser
  "domain/aiContext.ts", // AI hand-off context (Slice 11)
].map((p) => resolve(srcRoot, p));

const IMPORT_RE = /(?:import|export)[^"']*from\s*["']([^"']+)["']/g;

function resolveModule(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // package import — not part of our graph
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every source file transitively reachable from `entry` via relative imports. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveModule(file, match[1]!);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return seen;
}

describe("simulate sandbox import boundary", () => {
  const forbidden = resolve(srcRoot, "domain/simulateEvaluate.ts");

  for (const entry of SENSITIVE_ENTRIES) {
    it(`${entry.replace(srcRoot, "").replace(/\\/g, "/")} never reaches simulateEvaluate.ts`, () => {
      const reachable = reachableFrom(entry);
      expect(reachable.has(forbidden)).toBe(false);
    });
  }

  it("the sensitive entry files all exist (guards against a silent rename)", () => {
    for (const entry of SENSITIVE_ENTRIES) expect(existsSync(entry)).toBe(true);
    expect(existsSync(forbidden)).toBe(true);
  });
});
