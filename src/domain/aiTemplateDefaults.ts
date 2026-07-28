import {
  mergeTemplateOverrides,
  parseTemplate,
  type AiTemplate,
} from "./aiTemplates";

/**
 * The AI hand-off **template loader** (Slice 11, R-141). Bundles the default
 * Markdown-with-frontmatter templates shipped in `src/templates/ai-handoff/`
 * (T1–T6, AI-HANDOFF.md §5) and merges any user overrides kept in localStorage
 * (⚠Q57 (d)) — local-first, no backend. The pure parsing/merging lives in
 * `aiTemplates.ts`; this file is the impure edge (glob + storage).
 */

// Vite inlines each template's raw text at build time; there is no runtime fetch
// (no backend, Arch §3). Sorted by path so T1…T6 render in file order.
const sources = import.meta.glob("../templates/ai-handoff/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The bundled default templates, in filename order (T1…T6). */
export const DEFAULT_TEMPLATES: AiTemplate[] = Object.keys(sources)
  .sort()
  .map((path) => parseTemplate(sources[path]!));

/** The default source text for a template id (used to reset an override). */
export function defaultTemplateSource(id: string): string | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.id === id)?.source;
}

const OVERRIDES_KEY = "efb.ai.templateOverrides.v1";

function readOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, string>): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(OVERRIDES_KEY);
    else localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage unavailable (private mode / disabled) — overrides just don't
    // persist; the bundled defaults still work. Never throw from a save.
  }
}

/** The active templates: bundled defaults with any user overrides applied. */
export function loadTemplates(): AiTemplate[] {
  return mergeTemplateOverrides(DEFAULT_TEMPLATES, readOverrides());
}

/** Whether an id currently carries a user override (drives "Reset to default"). */
export function hasTemplateOverride(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(readOverrides(), id);
}

/** Save (or clear, when equal to the default) a raw-Markdown override for an id. */
export function saveTemplateOverride(id: string, raw: string): void {
  const overrides = readOverrides();
  if (raw.trim() === "" || raw === defaultTemplateSource(id)) delete overrides[id];
  else overrides[id] = raw;
  writeOverrides(overrides);
}

/** Drop an override, restoring the bundled default for an id. */
export function resetTemplateOverride(id: string): void {
  const overrides = readOverrides();
  delete overrides[id];
  writeOverrides(overrides);
}
