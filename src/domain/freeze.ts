import { stableStringify } from "./serialize";
import type { EvaluationQuestion } from "./schema";

/**
 * The Freeze pre-registration affordance (docs/ROADMAP-V2.md §1.6; full
 * canonicalisation rules documented in docs/FREEZE.md — keep the two in
 * sync). Produces a deterministic canonical JSON string and its SHA-256 hash
 * so an evaluator can publish the hash elsewhere as a pre-registration
 * commitment. The app makes no claim about publication itself and contacts
 * no service — that act happens outside this tool, by the user.
 */

function normaliseValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .normalize("NFC")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n");
  }
  if (Array.isArray(value)) return value.map(normaliseValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normaliseValue(val);
    }
    return out;
  }
  return value;
}

/**
 * The canonical, deterministic serialisation a Freeze hashes. Excludes
 * `updatedAt` (changes on every autosave — would make the hash useless) and
 * `recycleBin` (deleted material is not part of the frozen state); drops any
 * `RecordEntry` timestamped after `at` (a freeze can't retroactively capture
 * reasoning that hadn't happened yet); normalises line endings, trailing
 * whitespace, and Unicode form (NFC) on every string so the same framework
 * state always yields the same string, and therefore the same hash.
 *
 * Pure and synchronous — test this directly. `at` defaults to "now" for
 * convenience; the Freeze action itself should compute one timestamp once
 * and pass it here AND into the RecordEntry it writes, so both agree.
 */
export function canonicalise(doc: EvaluationQuestion, at: string = new Date().toISOString()): string {
  const { updatedAt: _updatedAt, recycleBin: _recycleBin, records, ...rest } = doc;
  const shaped = { ...rest, records: records.filter((r) => r.timestamp <= at) };
  return stableStringify(normaliseValue(shaped));
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of `canonicalise(doc, at)`, computed in-browser via SubtleCrypto. */
export async function freezeHash(doc: EvaluationQuestion, at?: string): Promise<string> {
  const canonical = canonicalise(doc, at);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return toHex(digest);
}
