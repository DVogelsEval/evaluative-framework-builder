/**
 * AI hand-off template model (Slice 11, R-141; AI-HANDOFF.md §3). Templates are
 * editable Markdown files with frontmatter — defaults bundled with the app,
 * user-overridable (a genuine community-contribution surface). This module is
 * the **pure** parser/renderer: no bundling glob, no localStorage, no DOM — so
 * it is fully Vitest-testable. The bundled defaults + override merge live in
 * `aiTemplateDefaults.ts`; the context values come from `aiContext.ts`.
 *
 * HARD non-goal (Arch C-7, Slice 11): this only *serialises context and renders
 * a prompt for the user to copy OUT* into their own AI. Nothing is sent, no
 * model is called, and nothing an AI returns is auto-applied — the user reads
 * the answer and types in only what they accept (R-142–R-144 deferred).
 */

/** Which node type a template's compose button shows on (AI-HANDOFF.md §3). */
export const AI_APPLIES_TO = [
  "evaluationQuestion",
  "continuum",
  "mesoNode",
  "overallJudgement",
] as const;

export type AiAppliesTo = (typeof AI_APPLIES_TO)[number];

/** The placeholder set the context serialiser fills (AI-HANDOFF.md §3, plus
 *  `evidenceMatrix` used by T4 and `glossaryTerms` per §2 — see ⚠Q57). */
export const AI_PLACEHOLDERS = [
  "evaluationQuestion",
  "valueLanguage",
  "nodeName",
  "nodeKindLabel",
  "nodeKindLabelPlural",
  "continuumTable",
  "cellDescriptions",
  "evidenceList",
  "evidenceTier",
  "synthesisRubric",
  "ancestorChain",
  "evidenceMatrix",
  "glossaryTerms",
] as const;

export type AiPlaceholder = (typeof AI_PLACEHOLDERS)[number];

export interface AiTemplateMeta {
  id: string;
  title: string;
  appliesTo: AiAppliesTo;
  version: number;
}

export interface AiTemplate extends AiTemplateMeta {
  /** The prompt body below the frontmatter, with `{{placeholders}}` intact. */
  body: string;
  /** The full raw source (frontmatter + body) — what an override stores/edits. */
  source: string;
}

function isAppliesTo(value: string): value is AiAppliesTo {
  return (AI_APPLIES_TO as readonly string[]).includes(value);
}

/**
 * Parse one Markdown-with-frontmatter template. Throws on a malformed template
 * (missing frontmatter fence, missing/invalid required field) so the loader can
 * catch a bad user override and fall back to the bundled default rather than
 * crash the app. Frontmatter is a minimal `key: value` block (no nested YAML —
 * these templates only carry flat scalar metadata).
 */
export function parseTemplate(raw: string): AiTemplate {
  const source = raw.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) {
    throw new Error("Template is missing its --- frontmatter --- block.");
  }
  const front: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    if (line.trim() === "") continue;
    const at = line.indexOf(":");
    if (at === -1) continue;
    front[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }

  const id = front.id ?? "";
  const title = front.title ?? "";
  const appliesTo = front.appliesTo ?? "";
  if (id === "") throw new Error("Template frontmatter is missing `id`.");
  if (title === "") throw new Error("Template frontmatter is missing `title`.");
  if (!isAppliesTo(appliesTo)) {
    throw new Error(
      `Template \`appliesTo\` must be one of ${AI_APPLIES_TO.join(", ")} (got "${appliesTo}").`,
    );
  }
  const version = Number.parseInt(front.version ?? "1", 10);

  return {
    id,
    title,
    appliesTo,
    version: Number.isFinite(version) ? version : 1,
    body: source.slice(match[0].length).trim(),
    source,
  };
}

/**
 * Render a template body by substituting `{{placeholder}}` with the serialised
 * context values (R-140). Unknown placeholders are left **as written** so a
 * user-authored placeholder the serialiser doesn't provide is visible rather
 * than silently blanked. Whitespace inside the braces is tolerated.
 */
export function renderPrompt(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key]! : whole,
  );
}

/**
 * Merge bundled defaults with user overrides (R-141, ⚠Q57 (d)). An override is
 * the full raw source keyed by template id; a parse failure falls back to the
 * default so a broken override never removes a template. Only the six bundled
 * ids are overridable in v1 — adding brand-new templates is deferred.
 */
export function mergeTemplateOverrides(
  defaults: AiTemplate[],
  overrides: Record<string, string>,
): AiTemplate[] {
  return defaults.map((base) => {
    const raw = overrides[base.id];
    if (raw === undefined) return base;
    try {
      const parsed = parseTemplate(raw);
      // Keep the override pinned to the slot it overrides — its id and appliesTo
      // are taken from the default so a typo can't re-target or orphan it.
      return { ...parsed, id: base.id, appliesTo: base.appliesTo };
    } catch {
      return base;
    }
  });
}
