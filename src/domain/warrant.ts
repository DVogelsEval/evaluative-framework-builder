import type { Warrant, WarrantType } from "./schema";

/**
 * The warrant typology's labels (V2 extension spec §3.1, Nunns/Peace/Witten
 * 2015; Q63). Lives in the domain so the editor (ConditionLogicEditor) and the
 * outputs serialiser name a type the same way. Deliberately flat and neutral —
 * no ranking, scoring or colour-coding (presenting `authority` alongside the
 * others without comment is what makes selecting it informative).
 */
export const WARRANT_TYPE_LABELS: Record<WarrantType, string> = {
  literature: "Literature",
  cultural: "Cultural",
  methodological: "Methodological",
  expert: "Expert",
  authority: "Authority",
};

/** The `source` field's prompt text, per type (Q63 table). */
export const WARRANT_SOURCE_PROMPTS: Record<WarrantType, string> = {
  literature: "Citation or reference",
  cultural: "Whose knowledge base, and how engaged",
  methodological: "Method or standard invoked",
  expert: "Whose expertise, and its basis",
  authority: "Who or what mandates this",
};

/** A warrant is complete once it has both a type and a non-empty source
 *  (Q63: source is required for all five types, including `authority`). An
 *  incomplete warrant is [report] only, never [gate] — see invariants.ts. */
export function warrantIncomplete(warrant: Warrant | undefined): boolean {
  if (!warrant) return false; // absent is not "incomplete" — nothing was started
  return warrant.type === null || warrant.source.trim() === "";
}

/** One-line rendering for outputs: "Literature (source) — text". Falls back
 *  gracefully for an untyped legacy warrant so the export never crashes on an
 *  incomplete one. */
export function warrantSummary(warrant: Warrant): string {
  const typeLabel = warrant.type ? WARRANT_TYPE_LABELS[warrant.type] : "(untyped)";
  const source = warrant.source.trim();
  const text = warrant.text.trim();
  const head = source !== "" ? `${typeLabel} (${source})` : typeLabel;
  return text !== "" ? `${head} — ${text}` : head;
}
