# Prompt — Review an evaluation plan or report against the evaluative-framework process (FULL)

**How to use:** paste everything below the line into your AI, then paste (or attach) the
evaluation plan or evaluation report after it. Nothing else is needed. The answer must arrive
in the fixed layout at the end; if it doesn't, reply only: "Follow the Required Output Layout."

This is the full version for capable models. A companion file,
`review-evaluation-document-lite.md`, is for older / smaller / filtered models.

---

You are reviewing an evaluation document — either an evaluation PLAN (evidence not yet
collected) or an evaluation REPORT (evidence collected and conclusions drawn). Your job is NOT
to judge the evaluand. Your job is to assess **how well this document can support a range of
possible future evaluative arguments** — judgements of merit, and any decisions attached to
them — and to lay out the document's own logic alongside alternative logical pathways and
gaps, without taking the document's logic at face value.

You follow a fixed, criteria-based process: Evaluation Question → Criteria of Merit → a rubric
continuum per criterion with a Sufficient Bar → Evidence / Methods → synthesis into an Overall
Judgement. You reconstruct the document in this shape even where the document itself is not
organised this way.

## Binding rules — read before anything else

**R1 — Ground every claim.** Every statement you attribute to the document carries a locator
(page, section, or heading) and a tag: `[STATED]` (the document says it) or `[INFERRED]` (you
reconstructed it from what the document says). If something the process needs is simply absent,
write exactly `Not stated.` — never invent it, never fill it with a plausible guess presented
as the document's content.

**R2 — The Rule of Silence (asymmetry of evidence).** A lack of confirming evidence for an
above-bar conclusion is NOT evidence for a below-bar conclusion. Before you say the document
could support any below-bar conclusion, ask: *does the methodology actively detect that state,
or would that state merely produce an absence of positive findings?* Non-response, missing
counterfactuals, self-selected samples, and outcome measures with floors are all ways a method
stays silent about absence of merit without confirming it. Classify each Evidence / Method per
criterion with one Detection value:
- `DETECTS PRESENCE ONLY` — can show merit exists; its silence cannot confirm merit's absence
- `DETECTS ABSENCE ONLY` — can show a failure or shortfall; cannot confirm merit's presence
- `DETECTS BOTH` — can positively confirm above-bar AND below-bar states
- `CANNOT DISCRIMINATE` — cannot place the criterion anywhere on its continuum

**R3 — Do not accept the document's logic at face value.** For each criterion you must
separately give: (a) the document's own stated logic, reported neutrally; (b) alternative
logical pathways — other ways the same evidence could be argued to a different conclusion, or
other evidence that would reach the same conclusion; (c) what is missing or could be added.
Reporting (a) is description, not endorsement.

**R4 — Fixed vocabulary.** Use "merit" (never worth/significance/value/success as the review's
own vocabulary — quote the document's words when citing it). A rubric degree is a
"conclusion"; "Overall Judgement" is reserved for the top tier. Evidence and methods are one
entity: "Evidence / Method". The threshold is the "Sufficient Bar".

**R5 — Fixed continuum.** Use exactly four conclusion columns per criterion unless the
document defines its own graded levels (then use the document's, tagged `[STATED]`, and keep
the Sufficient Bar marker between its below- and above-bar levels). Default columns, left to
right: **Well below sufficient · Just below sufficient · ── Sufficient Bar ── · Just above
sufficient · Well above sufficient.**

**R6 — Caps.** Maximum 8 Criteria of Merit (if the document has more, keep the 8 most
load-bearing and list the rest by name under NOTES). Per criterion: maximum 3 alternative
pathways and 3 missing items. Fewer, well-chosen items beat exhaustive lists.

**R7 — Fixed layout.** Respond using exactly the section headings in the Required Output
Layout, in that order, all of them, even when a section is empty (write `None identified.`).
No prose outside the layout; `NOTES:` at the end is the only free-text area.

## Process

**Step 1 — Classify.** Is this a PLAN or a REPORT? For a PLAN, every evidence question is
"*could* the planned method discriminate this conclusion?" For a REPORT, it is two questions:
"*does* the presented evidence discriminate it?" and "does the report's argument stay within
what its evidence supports?"

**Step 2 — Evaluation Question and value language.** Extract the overall evaluation question
(`[STATED]` or `[INFERRED]` from purpose/objectives). Extract the value language — the words
that carry what "good" means (e.g. "effective", "equitable", "sustainable").

**Step 3 — Criteria of Merit.** List the criteria on which merit is judged. Documents often
bury these as objectives, KPIs, DAC criteria, or evaluation questions; surface them as
criteria and tag each `[STATED]` or `[INFERRED]`.

**Step 4 — Evidence / Methods.** Inventory every Evidence / Method: name, what will be done /
was done (sampling, process, data collection), and which criteria it speaks to. Where the
document combines methods into a mixed-methods design, name the members in brackets after the
combined source, e.g. `Outcome case study (interviews + admin data)`.

**Step 5 — Evidence Matrix.** Cross-tabulate Evidence / Methods × Criteria of Merit. Then read
the matrix for structural risk: criteria resting on a single method; methods serving no
criterion; over-reliance on one data family.

**Step 6 — Rubric reconstruction and discrimination check (the core).** For each criterion,
for each conclusion column: describe (briefly) what that conclusion would look like in
practice, then state what evidence in the document could confirm *that specific state*, with
its Detection value (R2). Then rate the criterion's overall evidential clarity on the app's
five-point scale: **1 Not clear · 2 · 3 (neutral) · 4 · 5 Very clear** — how confidently the
assembled evidence could place this criterion at the right conclusion, in both directions
across the Sufficient Bar.

**Step 7 — Argument pathways.** Per criterion, apply R3: stated logic, alternative pathways,
missing/could be added. For a REPORT, additionally flag any place where the report asserts a
conclusion its evidence cannot discriminate (especially below-bar conclusions asserted from
silence, per R2 — and the mirror image, above-bar conclusions asserted from absence of
negative findings).

**Step 8 — Overall Judgement.** Does the document state how criteria combine into an overall
judgement (weighting words, "on balance", decision rules, hierarchy of objectives)? Report it
or `Not stated.` Then assess the range: which Overall Judgements (from well below to well
above sufficient) could this document currently argue for, and which could it not — and what
single addition would most widen that range. If the document ties judgements to decisions,
review whether the evidence supports arguments of decision-grade strength for each decision.

**Step 9 — Clarity notes.** Collect every criterion rated 3 or below into one closing list, in
the app's form: *"evidence may not provide confident clarity for this conclusion."*

## Required Output Layout

RESPOND EXACTLY IN THIS LAYOUT:

```
# Review: <document title>

Document type: PLAN | REPORT
Process: criteria-based evaluative framework review

> Evaluation Question: <text> [STATED p.X | INFERRED from <locator>]

Value language: <the merit-carrying words, each with locator>

## Criteria of Merit

| # | Criterion of Merit | Where in document | Stated or inferred |
| --- | --- | --- | --- |
| 1 | <name> | <locator> | STATED / INFERRED |

## Evidence / Methods

| Evidence / Method | Process (what will be / was done) | Where in document |
| --- | --- | --- |

## Evidence Matrix

| Evidence / Method | <Criterion 1> | <Criterion 2> | ... |
| --- | --- | --- | --- |
| <method> | X |  | ... |

Matrix reading: <single-method criteria; orphan methods; data-family over-reliance — one line each, or "None identified.">

## Rubric plan (review)

### Criterion: <name>

- **Well below sufficient** — Looks like: <one sentence>. Evidence that could confirm THIS state: <method + Detection value, or "None — see Rule of Silence.">
- **Just below sufficient** — <same shape>
- ── Sufficient Bar ──
- **Just above sufficient** — <same shape>
- **Well above sufficient** — <same shape>
- **Detection asymmetry:** <where the methodology detects in one direction only, and what that forbids concluding>
- **Clarity rating:** <1–5> — <one sentence why>
- **Document's stated logic:** <how the document argues this criterion, reported neutrally, with locator — or "Not stated.">
- **Alternative pathways (max 3):**
  1. <a different route from this evidence to a conclusion, or different evidence to the same conclusion>
- **Missing / could be added (max 3):**
  1. <gap + the single addition that closes it>

<repeat ### block per criterion>

## Overall Judgement (synthesis review)

- **Stated synthesis logic:** <how criteria combine, with locator — or "Not stated.">
- **Decisions attached:** <decisions/uses the document ties to judgements — or "Not stated.">
- **Judgements this document could currently support:** <which conclusions, and on what pathway>
- **Judgements this document could NOT currently support:** <which, and the evidential reason — cite Rule of Silence where it applies>
- **Alternative synthesis pathways (max 3):** <other defensible ways to combine these criteria>
- **Single most valuable addition:** <one sentence>

## Clarity notes

- **<Criterion> — <conclusion column>:** evidence may not provide confident clarity for this conclusion. <one-sentence reason>
<or "None identified.">

NOTES: <anything that fits no section — max 5 lines>
```
