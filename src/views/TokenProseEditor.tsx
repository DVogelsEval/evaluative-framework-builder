import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import type { ScenarioPart } from "../domain/schema";

/**
 * The shared insert-bold-token-and-type mechanic (Q41, Q43): free prose with
 * inline reference tokens rendered bold. J10 inserts Evidence/Method names;
 * the J11 synthesis reuses it with criterion names — there a token also names
 * the clicked column and renders "«name» is «Column Header»" (Q44 redirect,
 * 2026-07-14 notes), with the operator dropdown inserting plain text (⚠Q47).
 *
 * A contentEditable surface whose DOM is the editing state: parts → DOM only
 * when a change arrives from outside (so the caret survives ordinary typing,
 * which round-trips the store on every keystroke), DOM → parts on input.
 * Tokens are `contenteditable=false` islands — the caret steps over them and
 * Backspace removes a token whole. Token labels are rendered from `nameFor` /
 * `columnLabelFor` at every build, so a rename elsewhere updates the prose.
 */

export interface TokenProseHandle {
  /** Insert a token at the caret (or append) and put the caret after it.
   *  `atColumnId` names the clicked column — "«name» is «header»" (Q44). */
  insertToken: (targetId: string, atColumnId?: string) => void;
  /** Insert an R-110 collective group reference ("all other" / custom noun). */
  insertCollective: (label: string) => void;
  /** Insert plain text at the caret — the ⚠Q47 operator dropdown's writer. */
  insertText: (text: string) => void;
}

interface TokenProseProps {
  ref?: Ref<TokenProseHandle>;
  parts: ScenarioPart[];
  nameFor: (targetId: string) => string;
  /** Resolves a token's `atColumnId` to its Column Header (synthesis only). */
  columnLabelFor?: (columnId: string) => string;
  onChange: (parts: ScenarioPart[]) => void;
  onFocus?: () => void;
  placeholder?: string;
  label: string;
  testId?: string;
}

export function TokenProseEditor({
  ref,
  parts,
  nameFor,
  columnLabelFor,
  onChange,
  onFocus,
  placeholder,
  label,
  testId,
}: TokenProseProps) {
  const host = useRef<HTMLDivElement | null>(null);
  // Signature of the last state this editor itself emitted (or last built).
  const lastKnown = useRef<string | null>(null);
  // The caret as last seen inside this editor — clicking a method button in
  // the aside moves focus away, and this is where its token then lands.
  const savedRange = useRef<Range | null>(null);

  const tokenText = (part: ScenarioPart & { kind: "token" }): string => {
    const name = nameFor(part.targetId);
    return part.atColumnId !== undefined && columnLabelFor
      ? `${name} is ${columnLabelFor(part.atColumnId)}`
      : name;
  };

  const signature = (p: ScenarioPart[]): string =>
    JSON.stringify(
      p.map((part) => {
        if (part.kind === "text") return ["text", part.text];
        if (part.kind === "token") {
          return ["token", part.targetId, part.atColumnId ?? "", tokenText(part)];
        }
        return ["collective", part.label];
      }),
    );

  // Rebuild the DOM only for changes that did not originate here.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const incoming = signature(parts);
    if (incoming === lastKnown.current) return;
    lastKnown.current = incoming;
    savedRange.current = null;
    el.replaceChildren(...parts.map((part) => partToNode(part, tokenText)));
  });

  useEffect(() => {
    const remember = () => {
      const el = host.current;
      const selection = document.getSelection();
      if (!el || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (el.contains(range.startContainer)) savedRange.current = range.cloneRange();
    };
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  }, []);

  const emit = () => {
    const el = host.current;
    if (!el) return;
    // Deleting the last character can leave a lone <br>; drop it so the
    // :empty placeholder returns.
    if (el.childNodes.length === 1 && el.firstChild instanceof HTMLBRElement) {
      el.replaceChildren();
    }
    const next = domToParts(el);
    lastKnown.current = signature(next);
    onChange(next);
  };

  // Insert at the caret (a fragment's children move into the DOM, so the
  // caret must anchor to a node that stays connected — `caretAfter`).
  const insertAtCaret = (node: Node, caretAfter: Node = node) => {
    const el = host.current;
    if (!el) return;
    const saved = savedRange.current;
    const range =
      saved && saved.startContainer.isConnected && el.contains(saved.startContainer)
        ? saved
        : fullRangeCollapsedToEnd(el);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(caretAfter);
    range.collapse(true);
    el.focus();
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
    emit();
  };

  const insertIsland = (part: ScenarioPart) => {
    const island = partToNode(part, tokenText);
    const space = document.createTextNode(" ");
    const fragment = document.createDocumentFragment();
    fragment.append(island, space);
    insertAtCaret(fragment, space);
  };

  useImperativeHandle(ref, () => ({
    insertToken: (targetId, atColumnId) =>
      insertIsland(
        atColumnId !== undefined
          ? { kind: "token", targetId, atColumnId }
          : { kind: "token", targetId },
      ),
    insertCollective: (label) => insertIsland({ kind: "collective", label }),
    insertText: (text) => insertAtCaret(document.createTextNode(text)),
  }));

  return (
    <div
      ref={host}
      className="token-prose"
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-testid={testId}
      data-placeholder={placeholder}
      onFocus={onFocus}
      onInput={emit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          insertAtCaret(document.createTextNode("\n"));
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        if (text !== "") insertAtCaret(document.createTextNode(text));
      }}
    />
  );
}

/** A collapsed range at the very end of the editor — the no-caret fallback. */
function fullRangeCollapsedToEnd(el: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  return range;
}

function partToNode(
  part: ScenarioPart,
  tokenText: (part: ScenarioPart & { kind: "token" }) => string,
): Node {
  if (part.kind === "text") return document.createTextNode(part.text);
  const island = document.createElement("b");
  island.contentEditable = "false";
  if (part.kind === "token") {
    island.className = "prose-token";
    island.dataset["tokenId"] = part.targetId;
    if (part.atColumnId !== undefined) island.dataset["atColumnId"] = part.atColumnId;
    island.textContent = tokenText(part);
  } else {
    island.className = "prose-token prose-collective";
    island.dataset["collectiveLabel"] = part.label;
    island.textContent = part.label;
  }
  return island;
}

/** Serialize the editable DOM back to parts: token/collective islands by
 *  their data attributes, all other content as plain text (adjacent runs
 *  merged, <br> as a newline). */
function domToParts(el: HTMLElement): ScenarioPart[] {
  const parts: ScenarioPart[] = [];
  const pushText = (text: string) => {
    if (text === "") return;
    const last = parts[parts.length - 1];
    if (last?.kind === "text") last.text += text;
    else parts.push({ kind: "text", text });
  };
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tokenId = node.dataset["tokenId"];
    if (tokenId !== undefined) {
      const atColumnId = node.dataset["atColumnId"];
      parts.push(
        atColumnId !== undefined
          ? { kind: "token", targetId: tokenId, atColumnId }
          : { kind: "token", targetId: tokenId },
      );
      return;
    }
    const collectiveLabel = node.dataset["collectiveLabel"];
    if (collectiveLabel !== undefined) {
      parts.push({ kind: "collective", label: collectiveLabel });
      return;
    }
    if (node.tagName === "BR") {
      pushText("\n");
      return;
    }
    node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return parts;
}
