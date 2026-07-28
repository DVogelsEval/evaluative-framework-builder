import { useMemo, useState } from "react";
import { handoffTargets, serializeContext } from "../domain/aiContext";
import {
  hasTemplateOverride,
  loadTemplates,
  resetTemplateOverride,
  saveTemplateOverride,
} from "../domain/aiTemplateDefaults";
import { renderPrompt, type AiTemplate } from "../domain/aiTemplates";
import { downloadText } from "../persistence/file";
import { titleSlug, useStore } from "../store/store";

/**
 * Slice 11 — AI hand-off / prompt-out (R-139–R-141; AI-HANDOFF.md). Composes a
 * prompt about a chosen part of the framework and lets the user **copy it OUT**
 * into whatever AI they use. One surface, reached from the Home Window, giving a
 * "Copy prompt" path per node type (⚠Q57 (a)): pick a target → pick an
 * applicable template → read the composed prompt → copy / save-as-text / print.
 *
 * HARD non-goal (Arch C-7, refuse + flag if asked to add): NO AI inference, API
 * keys, or model calls. Nothing is sent anywhere and nothing an AI returns is
 * auto-applied — the user reads the answer and types in only what they accept
 * (R-142–R-144 deferred). The standing principle: *AI critiques and expands; it
 * never authors the evaluative claims.*
 */
export function AiHandoffView() {
  const doc = useStore((s) => s.doc);
  const setView = useStore((s) => s.setView);

  // Reload templates after an override save/reset (bump to re-run loadTemplates).
  const [overrideVersion, setOverrideVersion] = useState(0);
  const templates = useMemo(() => loadTemplates(), [overrideVersion]);
  const targets = useMemo(() => (doc ? handoffTargets(doc) : []), [doc]);

  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "eq");
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];

  const applicable = target
    ? templates.filter((t) => t.appliesTo === target.kind)
    : [];
  const [templateId, setTemplateId] = useState(applicable[0]?.id ?? "");
  const template =
    applicable.find((t) => t.id === templateId) ?? applicable[0] ?? undefined;

  const [helpOpen, setHelpOpen] = useState(false);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [status, setStatus] = useState<string | undefined>();

  if (!doc || !target) return null;

  const prompt = template
    ? renderPrompt(template.body, serializeContext(doc, target))
    : "";

  const onSelectTarget = (key: string) => {
    setTargetKey(key);
    setStatus(undefined);
    setCustomiseOpen(false);
    // Keep a valid template selected for the new target's kind.
    const next = targets.find((t) => t.key === key);
    const fit = next ? templates.filter((t) => t.appliesTo === next.kind) : [];
    if (!fit.some((t) => t.id === templateId)) setTemplateId(fit[0]?.id ?? "");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("Copied to clipboard ✓ — now paste it into your own AI tool.");
    } catch {
      setStatus("Couldn't reach the clipboard — select the prompt below and copy it manually.");
    }
  };

  const saveText = () => {
    if (!template) return;
    downloadText(`${titleSlug(doc.title)}-${template.id}.txt`, prompt, "text/plain");
    setStatus("Saved the prompt as a .txt file ✓.");
  };

  return (
    <section className="panel ai-handoff-view" data-testid="ai-handoff-view">
      <div className="no-print">
        <div className="ai-handoff-toolbar">
          <h2>AI hand-off — copy a prompt</h2>
          <div className="ai-handoff-actions">
            <button
              type="button"
              className="secondary"
              data-testid="ai-handoff-help-toggle"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((o) => !o)}
            >
              How this works
            </button>
            <button
              type="button"
              className="secondary"
              data-testid="ai-handoff-back-home"
              onClick={() => setView("home")}
            >
              ← Home Window
            </button>
          </div>
        </div>

        <p className="hint" data-testid="ai-handoff-principle">
          This composes a prompt for you to copy into whatever AI you use. Nothing
          is sent from here and nothing the AI says is applied automatically —{" "}
          <strong>AI critiques and expands; you decide and type in only what you
          accept.</strong>
        </p>

        {helpOpen && (
          <div className="ai-handoff-help" data-testid="ai-handoff-help">
            <ol>
              <li>Pick the part of the framework you want feedback on, and a prompt.</li>
              <li>
                Copy the prompt and paste it into the AI you use (Claude, ChatGPT, a
                local model — anything). No data leaves this app except via your
                clipboard.
              </li>
              <li>
                The prompt ends with a required layout, so the answer comes back as
                labelled fields matching this app's inputs.
              </li>
              <li>Read the answer and type in only what you accept. The app never sees the AI's text.</li>
            </ol>
          </div>
        )}

        <div className="ai-handoff-pickers">
          <label className="ai-handoff-field">
            <span>Ask about</span>
            <select
              data-testid="ai-target-select"
              value={target.key}
              onChange={(e) => onSelectTarget(e.target.value)}
            >
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ai-handoff-field">
            <span>Prompt</span>
            <select
              data-testid="ai-template-select"
              value={template?.id ?? ""}
              disabled={applicable.length === 0}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setStatus(undefined);
                setCustomiseOpen(false);
              }}
            >
              {applicable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {applicable.length === 0 ? (
          <p className="hint" data-testid="ai-no-templates">
            No prompt templates apply to this part of the framework yet.
          </p>
        ) : (
          <>
            <div className="ai-handoff-buttons">
              <button type="button" data-testid="ai-copy-prompt" onClick={copy}>
                Copy prompt
              </button>
              <button
                type="button"
                className="secondary"
                data-testid="ai-save-text"
                onClick={saveText}
              >
                Save prompt as text
              </button>
              <button
                type="button"
                className="secondary"
                data-testid="ai-print"
                onClick={() => window.print()}
              >
                Print / save as PDF
              </button>
              <button
                type="button"
                className="secondary"
                data-testid="ai-customise-toggle"
                aria-expanded={customiseOpen}
                onClick={() => setCustomiseOpen((o) => !o)}
              >
                Customise this template
              </button>
            </div>
            {status !== undefined && (
              <p className="save-status" data-testid="ai-status">
                {status}
              </p>
            )}

            {customiseOpen && template && (
              <TemplateEditor
                template={template}
                onSaved={() => {
                  setOverrideVersion((v) => v + 1);
                  setStatus("Saved your version of this template ✓.");
                  setCustomiseOpen(false);
                }}
                onReset={() => {
                  setOverrideVersion((v) => v + 1);
                  setStatus("Restored the bundled default template ✓.");
                  setCustomiseOpen(false);
                }}
              />
            )}
          </>
        )}
      </div>

      {/* The composed prompt — read-only, and the print/save-to-PDF surface. */}
      {template && (
        <div className="output-sheet" data-testid="ai-output-sheet">
          <h3 className="no-print">Prompt preview</h3>
          <pre className="ai-prompt" data-testid="ai-prompt-preview">
            {prompt}
          </pre>
        </div>
      )}
    </section>
  );
}

/** The user-override editor (R-141, ⚠Q57 (d)): edit the raw Markdown of a
 *  template; Save stores it in localStorage, Reset drops back to the default. */
function TemplateEditor({
  template,
  onSaved,
  onReset,
}: {
  template: AiTemplate;
  onSaved: () => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(template.source);
  const overridden = hasTemplateOverride(template.id);
  return (
    <div className="ai-template-editor" data-testid="ai-template-editor">
      <p className="hint">
        Templates are plain Markdown with a small frontmatter block. Your edits are
        saved in this browser only. Keep the <code>{"{{placeholders}}"}</code> to
        pull in the framework's context.
      </p>
      <textarea
        className="ai-template-source"
        data-testid="ai-template-source"
        rows={16}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="ai-handoff-buttons">
        <button
          type="button"
          data-testid="ai-save-template"
          onClick={() => {
            saveTemplateOverride(template.id, draft);
            onSaved();
          }}
        >
          Save my version
        </button>
        <button
          type="button"
          className="secondary"
          data-testid="ai-reset-template"
          disabled={!overridden}
          onClick={() => {
            resetTemplateOverride(template.id);
            onReset();
          }}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
