import {
  COMPARATOR_PHRASE,
  PATTERN_VALUES,
  STRENGTH_VALUES,
  TIER_TYPE_VALUES,
  comparatorTakesValue,
  type EvidenceElement,
} from "./conditionLexicon";
import type {
  BooleanConditionNode,
  Comparator,
  ComparisonValue,
  ConditionTerm,
} from "./schema";

/**
 * The plain-English boolean parser (Slice 13, R-COND-9). It lexes and parses a
 * condition string into the AST (`BooleanConditionNode`), renders an AST back to
 * canonical plain English, and validates for syntax + semantic issues. It is
 * **not** an evaluator — it never runs a condition to decide anything (that is
 * the isolated Slice-14 sandbox). Precedence follows CONDITION-LEXICON §H:
 * `not` > `and` > `or`.
 */

// ---- Lexer -------------------------------------------------------------------

type Token =
  | { t: "element"; raw: string }
  | { t: "comparator"; value: Comparator }
  | { t: "value"; value: ComparisonValue }
  | { t: "and" }
  | { t: "or" }
  | { t: "not" }
  | { t: "lparen" }
  | { t: "rparen" };

// Comparator phrases longest-first, so "is at or above" wins over "is".
const COMPARATOR_ENTRIES: [string, Comparator][] = (
  Object.entries(COMPARATOR_PHRASE) as [Comparator, string][]
)
  .map(([comparator, phrase]): [string, Comparator] => [phrase, comparator])
  .sort((a, b) => b[0].length - a[0].length);

// Known value phrases longest-first ("Not Yet" before any single word); the
// parser only consults these when a value is expected, so "not" the operator and
// "Not" in "Not Yet" never collide.
const VALUE_ENTRIES: [string, ComparisonValue][] = [
  ...STRENGTH_VALUES.map((v): [string, ComparisonValue] => [v, v]),
  ...PATTERN_VALUES.map((v): [string, ComparisonValue] => [v, v]),
  ...TIER_TYPE_VALUES.map((v): [string, ComparisonValue] => [v, v]),
  ["true", true] as [string, ComparisonValue],
  ["false", false] as [string, ComparisonValue],
].sort((a, b) => b[0].length - a[0].length);

const isBoundary = (ch: string | undefined): boolean =>
  ch === undefined || /\s/.test(ch) || ch === "(" || ch === ")" || ch === "[";

export interface LexResult {
  tokens: Token[];
  errors: string[];
}

/** Tokenise a condition string. Unknown keywords are recorded as errors but
 *  lexing continues so the user sees every problem, not just the first. */
export function tokenize(input: string): LexResult {
  const tokens: Token[] = [];
  const errors: string[] = [];
  let i = 0;
  const n = input.length;
  let expectValue = false;

  const matchPhrase = (entries: [string, unknown][]): [string, unknown] | null => {
    const lower = input.toLowerCase();
    for (const entry of entries) {
      const phrase = entry[0].toLowerCase();
      if (
        lower.startsWith(phrase, i) &&
        isBoundary(input[i + phrase.length]) &&
        (i === 0 || isBoundary(input[i - 1]) || input[i - 1] === "]")
      ) {
        return entry;
      }
    }
    return null;
  };

  while (i < n) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "[") {
      const close = input.indexOf("]", i);
      if (close === -1) {
        errors.push(`Unclosed evidence element bracket at position ${i}.`);
        tokens.push({ t: "element", raw: input.slice(i + 1).trim() });
        break;
      }
      tokens.push({ t: "element", raw: input.slice(i + 1, close).trim() });
      i = close + 1;
      expectValue = false;
      continue;
    }
    if (ch === "(") {
      tokens.push({ t: "lparen" });
      i++;
      expectValue = false;
      continue;
    }
    if (ch === ")") {
      tokens.push({ t: "rparen" });
      i++;
      expectValue = false;
      continue;
    }

    if (expectValue) {
      const num = /^-?\d+/.exec(input.slice(i));
      if (num && isBoundary(input[i + num[0].length])) {
        tokens.push({ t: "value", value: Number(num[0]) });
        i += num[0].length;
        expectValue = false;
        continue;
      }
      const valueMatch = matchPhrase(VALUE_ENTRIES);
      if (valueMatch) {
        tokens.push({ t: "value", value: valueMatch[1] as ComparisonValue });
        i += valueMatch[0].length;
        expectValue = false;
        continue;
      }
      const word = /^\S+/.exec(input.slice(i))?.[0] ?? "";
      errors.push(`Unknown value '${word}' at position ${i}.`);
      i += word.length || 1;
      expectValue = false;
      continue;
    }

    // Operators first (and/or/not), then comparator phrases.
    const opMatch = matchPhrase([
      ["and", "and"],
      ["or", "or"],
      ["not", "not"],
    ]);
    if (opMatch) {
      tokens.push({ t: opMatch[1] as "and" | "or" | "not" });
      i += opMatch[0].length;
      continue;
    }
    const compMatch = matchPhrase(COMPARATOR_ENTRIES);
    if (compMatch) {
      const comparator = compMatch[1] as Comparator;
      // Disambiguate "is Not Yet" (the equals comparator + the strength value
      // "Not Yet") from "is not <value>" (the not-equals comparator). "Not Yet"
      // is the only value beginning with "not", so this is the sole collision.
      if (comparator === "is_not" && /^is\s+not\s+yet\b/i.test(input.slice(i))) {
        tokens.push({ t: "comparator", value: "is" });
        i += 2; // length of "is"
        expectValue = true;
        continue;
      }
      tokens.push({ t: "comparator", value: comparator });
      i += compMatch[0].length;
      expectValue = comparatorTakesValue(comparator);
      continue;
    }

    const word = /^\S+/.exec(input.slice(i))?.[0] ?? "";
    errors.push(`Unknown keyword '${word}' at position ${i}.`);
    i += word.length || 1;
  }

  return { tokens, errors };
}

// ---- Parser (recursive descent, precedence not > and > or) -------------------

export interface ParseResult {
  root: BooleanConditionNode;
  errors: string[];
}

const EMPTY_TERM: ConditionTerm = {
  evidenceElementId: "",
  evidenceElementLabel: "[?]",
  comparator: "is",
  value: null,
  valueLabel: "",
};

/** Parse a condition string into an AST. Always returns a best-effort root so
 *  the renderer never crashes; problems surface in `errors` (R-COND-9). */
export function parse(input: string): ParseResult {
  const lex = tokenize(input);
  const tokens = lex.tokens;
  const errors = [...lex.errors];
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  const parseOr = (): BooleanConditionNode => {
    const operands = [parseAnd()];
    while (peek()?.t === "or") {
      next();
      operands.push(parseAnd());
    }
    return operands.length === 1 ? operands[0]! : { type: "OR", operands };
  };

  const parseAnd = (): BooleanConditionNode => {
    const operands = [parseNot()];
    while (peek()?.t === "and") {
      next();
      operands.push(parseNot());
    }
    return operands.length === 1 ? operands[0]! : { type: "AND", operands };
  };

  const parseNot = (): BooleanConditionNode => {
    if (peek()?.t === "not") {
      next();
      return { type: "NOT", operand: parseNot() };
    }
    return parseAtom();
  };

  const parseAtom = (): BooleanConditionNode => {
    const token = peek();
    if (token?.t === "lparen") {
      next();
      const inner = parseOr();
      if (peek()?.t === "rparen") {
        next();
      } else {
        errors.push("Unmatched opening parenthesis.");
      }
      return inner;
    }
    return parseTerm();
  };

  const parseTerm = (): BooleanConditionNode => {
    const elementToken = peek();
    if (elementToken?.t !== "element") {
      errors.push(
        elementToken === undefined
          ? "Expected an evidence element but reached the end."
          : "Expected an evidence element (in [brackets]) here.",
      );
      if (elementToken !== undefined) next(); // consume to make progress
      return { type: "TERM", term: { ...EMPTY_TERM } };
    }
    next();
    const label = `[${elementToken.raw}]`;

    const comparatorToken = peek();
    if (comparatorToken?.t !== "comparator") {
      errors.push(`Missing comparator after ${label}.`);
      return {
        type: "TERM",
        term: { ...EMPTY_TERM, evidenceElementId: elementToken.raw, evidenceElementLabel: label },
      };
    }
    next();
    const comparator = comparatorToken.value;

    let value: ComparisonValue = null;
    if (comparatorTakesValue(comparator)) {
      const valueToken = peek();
      if (valueToken?.t === "value") {
        next();
        value = valueToken.value;
      } else {
        errors.push(`Value required after "${COMPARATOR_PHRASE[comparator]}".`);
      }
    }

    return {
      type: "TERM",
      term: {
        evidenceElementId: elementToken.raw,
        evidenceElementLabel: label,
        comparator,
        value,
        valueLabel: value === null ? "" : String(value),
      },
    };
  };

  if (tokens.length === 0) {
    return { root: { type: "TERM", term: { ...EMPTY_TERM } }, errors };
  }

  const root = parseOr();
  if (pos < tokens.length) {
    errors.push("Unexpected trailing input after the condition.");
    if (peek()?.t === "rparen") errors.push("Unmatched closing parenthesis.");
  }
  return { root, errors };
}

// ---- Renderer (AST → canonical plain English) --------------------------------

/** Render a single term: `[Method A] is at or above Good`. */
export function renderTerm(term: ConditionTerm): string {
  const phrase = COMPARATOR_PHRASE[term.comparator];
  const valuePart =
    term.value === null || term.valueLabel === "" ? "" : ` ${term.valueLabel}`;
  return `${term.evidenceElementLabel} ${phrase}${valuePart}`;
}

/**
 * Render an AST to canonical plain English (R-COND-9). Lower-precedence
 * operands are parenthesised so the reading is unambiguous, and `not` always
 * wraps its operand (matching the lexicon's `not (...)` examples).
 */
export function toPlainEnglish(node: BooleanConditionNode): string {
  switch (node.type) {
    case "TERM":
      return renderTerm(node.term);
    case "NOT":
      return `not (${toPlainEnglish(node.operand)})`;
    case "AND":
      return node.operands
        .map((op) => (op.type === "OR" ? `(${toPlainEnglish(op)})` : toPlainEnglish(op)))
        .join(" and ");
    case "OR":
      return node.operands.map((op) => toPlainEnglish(op)).join(" or ");
  }
}

// ---- Validation (R-COND-9, CONDITION-LEXICON §J) -----------------------------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Comparators that are logical complements on the same element + value: if one
 *  holds the other cannot, so their OR is always true and their AND always
 *  false. Used for the always-true / always-false heuristics (§J.2). */
const COMPLEMENTS: Partial<Record<Comparator, Comparator>> = {
  is: "is_not",
  is_not: "is",
  is_at_or_above: "is_below",
  is_below: "is_at_or_above",
  is_at_least: "is_fewer_than",
  is_fewer_than: "is_at_least",
  is_more_than: "is_at_most",
  is_at_most: "is_more_than",
  exists: "does_not_exist",
  does_not_exist: "exists",
  shows: "does_not_show",
  does_not_show: "shows",
  contains: "does_not_contain",
  does_not_contain: "contains",
};

const sameElementValue = (a: ConditionTerm, b: ConditionTerm): boolean =>
  a.evidenceElementId === b.evidenceElementId && a.value === b.value;

const areComplementary = (a: ConditionTerm, b: ConditionTerm): boolean =>
  sameElementValue(a, b) && COMPLEMENTS[a.comparator] === b.comparator;

const termsEqual = (a: ConditionTerm, b: ConditionTerm): boolean =>
  sameElementValue(a, b) && a.comparator === b.comparator;

/** The term a node reduces to if it is `TERM` or `NOT(TERM)`; used to spot a
 *  term paired with its own negation. */
function asTermOrNegatedTerm(
  node: BooleanConditionNode,
): { term: ConditionTerm; negated: boolean } | null {
  if (node.type === "TERM") return { term: node.term, negated: false };
  if (node.type === "NOT" && node.operand.type === "TERM") {
    return { term: node.operand.term, negated: true };
  }
  return null;
}

/**
 * Validate an AST against the node's available elements (R-COND-9). Errors are
 * shown but never block save; warnings are informational. Detects: elements not
 * present on the node (warning), always-false contradictions (error), and
 * always-true tautologies (warning) for the common `X and/or not X` shapes.
 */
export function validate(
  node: BooleanConditionNode,
  availableElements: EvidenceElement[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownIds = new Set(availableElements.map((e) => e.id));
  const knownLabels = new Set(availableElements.map((e) => e.label));

  const walk = (n: BooleanConditionNode): void => {
    switch (n.type) {
      case "TERM": {
        const { evidenceElementId, evidenceElementLabel } = n.term;
        if (
          evidenceElementId !== "" &&
          !knownIds.has(evidenceElementId) &&
          !knownLabels.has(evidenceElementLabel)
        ) {
          warnings.push(
            `${evidenceElementLabel} is not an evidence element on this node — the condition can't be checked against it.`,
          );
        }
        break;
      }
      case "NOT":
        walk(n.operand);
        break;
      case "AND":
      case "OR": {
        // Pairwise scan for a term and its complement / negation.
        const reduced = n.operands.map(asTermOrNegatedTerm);
        for (let a = 0; a < reduced.length; a++) {
          for (let b = a + 1; b < reduced.length; b++) {
            const ra = reduced[a];
            const rb = reduced[b];
            if (!ra || !rb) continue;
            const opposite =
              (ra.negated === rb.negated && areComplementary(ra.term, rb.term)) ||
              (ra.negated !== rb.negated && termsEqual(ra.term, rb.term));
            if (!opposite) continue;
            if (n.type === "AND") {
              errors.push(
                "This condition can never be true — it requires an element to be two contradictory things at once.",
              );
            } else {
              warnings.push(
                "This condition is always true — it covers a value and its own opposite.",
              );
            }
          }
        }
        n.operands.forEach(walk);
        break;
      }
    }
  };

  walk(node);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// ---- Flat editing model (used by the click-based builder) --------------------
//
// The click builder edits a condition as a top-level list of operands joined by
// one operator (AND or OR), each operand a term or a negated term — the shape
// the mockup shows (R-COND-2). It covers everything the builder produces;
// anything more nested (e.g. a hand-typed condition with inner parentheses)
// does not fit and returns null, so the editor can offer to rebuild it.

export interface FlatItem {
  negated: boolean;
  term: ConditionTerm;
}
export interface FlatCondition {
  op: "AND" | "OR";
  items: FlatItem[];
}

const asFlatItem = (node: BooleanConditionNode): FlatItem | null => {
  if (node.type === "TERM") return { negated: false, term: node.term };
  if (node.type === "NOT" && node.operand.type === "TERM") {
    return { negated: true, term: node.operand.term };
  }
  return null;
};

/** Decompose an AST into the flat editing model, or null if it is more nested
 *  than a single-operator list of (possibly negated) terms. */
export function astToFlat(root: BooleanConditionNode): FlatCondition | null {
  const single = asFlatItem(root);
  if (single) return { op: "AND", items: [single] };
  if (root.type === "AND" || root.type === "OR") {
    const items: FlatItem[] = [];
    for (const operand of root.operands) {
      const item = asFlatItem(operand);
      if (!item) return null;
      items.push(item);
    }
    return { op: root.type, items };
  }
  return null;
}

/** Rebuild an AST from the flat editing model. */
export function flatToAst(flat: FlatCondition): BooleanConditionNode {
  const operands: BooleanConditionNode[] = flat.items.map((item) =>
    item.negated
      ? { type: "NOT", operand: { type: "TERM", term: item.term } }
      : { type: "TERM", term: item.term },
  );
  if (operands.length === 1) return operands[0]!;
  return { type: flat.op, operands };
}

// ---- Assembly helper (used by the store when saving a built tree) ------------

/** Build a stored boolean tree from an AST: canonical plain English plus any
 *  errors/warnings from parsing/validating it, so a click-built and a
 *  typed-and-reparsed condition are stored identically. */
export function buildBooleanTree(
  root: BooleanConditionNode,
  availableElements: EvidenceElement[],
): { root: BooleanConditionNode; plainEnglish: string; errors?: string[]; warnings?: string[] } {
  const plainEnglish = toPlainEnglish(root);
  const { warnings } = validate(root, availableElements);
  // The reparse is a round-trip consistency check for typed input. A conclusion
  // reference (§B.7, Slice 14) compares against a *column header* — arbitrary
  // user text the lexer can't retokenise as a value — so skip the reparse when
  // the tree carries one: the click-built AST is authoritative there.
  const errors = hasConclusionTerm(root) ? [] : parse(plainEnglish).errors;
  return {
    root,
    plainEnglish,
    ...(errors.length > 0 ? { errors } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** Whether any term in the tree targets a resulting-conclusion column (§B.7). */
function hasConclusionTerm(node: BooleanConditionNode): boolean {
  switch (node.type) {
    case "TERM":
      return typeof node.term.value === "object" && node.term.value !== null;
    case "NOT":
      return hasConclusionTerm(node.operand);
    case "AND":
    case "OR":
      return node.operands.some(hasConclusionTerm);
  }
}
