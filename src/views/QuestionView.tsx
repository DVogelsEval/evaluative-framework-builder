import { useRef, useState, type ReactNode } from "react";
import type { ValueSpan } from "../domain/schema";
import { useStore } from "../store/store";
import { WizardNav } from "./WizardNav";

/**
 * J2, step 1: write the Evaluation Question (R-033) and highlight the
 * value-language within it (R-034). The highlighted spans seed the continuum's
 * positive headers on Continue (R-035, GWT-2.2, Q34).
 */
export function QuestionView() {
  const doc = useStore((s) => s.doc);
  const setQuestionText = useStore((s) => s.setQuestionText);
  const addValueSpan = useStore((s) => s.addValueSpan);
  const removeValueSpan = useStore((s) => s.removeValueSpan);
  const seed = useStore((s) => s.seedContinuumFromValueLanguage);
  const setView = useStore((s) => s.setView);
  const [blocked, setBlocked] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!doc) return null;
  const spans = doc.valueLanguage ?? [];

  const markSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionEnd > selectionStart) {
      addValueSpan(
        selectionStart,
        selectionEnd,
        doc.questionText.slice(selectionStart, selectionEnd),
      );
    }
  };

  return (
    <section className="panel">
      <h2>Write the Evaluation Question</h2>
      <p>The overall question this framework will answer.</p>
      <textarea
        ref={textareaRef}
        data-testid="question-text"
        rows={4}
        value={doc.questionText}
        onChange={(e) => setQuestionText(e.target.value)}
      />
      <p className="hint">
        Select the <strong>value-language</strong> in your question — the words that
        express merit — and mark it. It seeds the positive headers of your continuum.
      </p>
      <button
        type="button"
        className="secondary"
        data-testid="mark-value-language"
        onClick={markSelection}
      >
        Mark selected value-language
      </button>

      {spans.length > 0 && (
        <>
          <HighlightedQuestion text={doc.questionText} spans={spans} />
          <ul className="value-chips" data-testid="value-language-list">
            {spans.map((s) => (
              <li key={s.id} className="value-chip">
                <span>{s.text}</span>
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove value-language "${s.text}"`}
                  data-testid={`remove-value-span-${s.id}`}
                  onClick={() => removeValueSpan(s.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <WizardNav
        continueTestId="question-continue"
        onContinue={() => {
          if (doc.questionText.trim() === "") {
            setBlocked(true);
            return;
          }
          setBlocked(false);
          seed(); // value-language → empty positive headers (Q34)
          setView("continuum");
        }}
      />
      {blocked && (
        <p role="alert" className="error" data-testid="question-blocked">
          The Evaluation Question cannot be empty.
        </p>
      )}
    </section>
  );
}

/** Renders the question with its highlighted value-language spans as <mark>s. */
function HighlightedQuestion({ text, spans }: { text: string; spans: ValueSpan[] }) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((s, i) => {
    if (s.start > cursor) parts.push(<span key={`plain-${i}`}>{text.slice(cursor, s.start)}</span>);
    parts.push(
      <mark key={`mark-${i}`} className="value-mark">
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <p className="question-highlighted" data-testid="question-highlighted">
      {parts}
    </p>
  );
}
