# Prompt — Review an evaluation plan or report (LITE, for older / smaller models)

**How to use:** paste everything below the line into the AI, then paste the evaluation plan or
report after it. If the model drifts from the layout, reply only: "Follow the Output Layout."
If the document is long or the model struggles, run in two passes: Pass 1 = sections up to and
including the Evidence Matrix; Pass 2 = one message per criterion ("Now do the Rubric plan
section for criterion: <name>"), then one final message for the last two sections. The
headings are identical either way, so the passes concatenate into one report.

This is the reduced version of `review-evaluation-document.md`. Same process, same output
shape, simpler instructions.

---

You are reviewing an evaluation PLAN or evaluation REPORT. Do not judge the program itself.
Judge only this: **how well could this document support different evaluative conclusions in
the future?**

Follow every rule exactly.

RULES:

1. Only use what the document says. After each fact write where it is (page or section) and
   STATED or INFERRED. If the document does not say something, write exactly: `Not stated.`
   Never guess.
2. Use these words: "merit" (not worth, value, success), "conclusion" (a level on a
   criterion), "Overall Judgement" (the final combined judgement only), "Evidence / Method"
   (any data source or method), "Sufficient Bar" (the line between good enough and not).
3. Every criterion uses the same four conclusions, in this order:
   Well below sufficient · Just below sufficient · ── Sufficient Bar ── · Just above
   sufficient · Well above sufficient.
4. THE SILENCE RULE. If the evidence does not show a high conclusion, that does NOT prove a
   low conclusion. For each low conclusion ask: "If this bad state were true, would the
   methods actively show it?" Answer `SHOWN` (a method would show it) or `ONLY SILENCE`
   (we would just see nothing). Never conclude a low level from ONLY SILENCE.
5. Describe the document's own reasoning without agreeing with it. Then give other possible
   reasonings and what is missing.
6. Maximum 5 Criteria of Merit (pick the most important; name the rest in NOTES). Maximum 2
   alternative pathways and 2 missing items per criterion.
7. Use the Output Layout exactly: every heading, in order, even if a section is empty (write
   `None identified.`). No text outside the layout except the final NOTES line.

STEPS:

1. Say if it is a PLAN (evidence not yet collected) or REPORT (evidence collected).
2. Find the evaluation question and the words that say what "good" means.
3. List the Criteria of Merit (they may be called objectives, KPIs, or questions).
4. List every Evidence / Method and what will be / was done.
5. Fill the Evidence Matrix: X where a method speaks to a criterion. Then note: criteria
   with only one X, methods with no X, and whether most methods are the same kind of data.
6. For each criterion, for each of the four conclusions: one sentence on what it would look
   like, then which Evidence / Method could confirm THAT state — with SHOWN or ONLY SILENCE
   for the two low conclusions. Then rate evidence clarity 1 (Not clear) to 5 (Very clear).
7. For each criterion: the document's own logic; up to 2 alternative pathways; up to 2
   missing things.
8. Say how the document combines criteria into an Overall Judgement (or `Not stated.`),
   which judgements it could and could not currently support, and the one best addition.
9. List every criterion rated 3 or lower as a clarity note.

OUTPUT LAYOUT — copy this structure exactly:

```
# Review: <document title>

Document type: PLAN | REPORT
Process: criteria-based evaluative framework review

> Evaluation Question: <text> [STATED p.X | INFERRED from <where>]

Value language: <words, with where they appear>

## Criteria of Merit

| # | Criterion of Merit | Where in document | Stated or inferred |
| --- | --- | --- | --- |

## Evidence / Methods

| Evidence / Method | Process (what will be / was done) | Where in document |
| --- | --- | --- |

## Evidence Matrix

| Evidence / Method | <Criterion 1> | <Criterion 2> | ... |
| --- | --- | --- | --- |

Matrix reading: <one line each: single-method criteria; unused methods; same-kind data — or "None identified.">

## Rubric plan (review)

### Criterion: <name>

- **Well below sufficient** — Looks like: <sentence>. Confirmed by: <method — SHOWN | ONLY SILENCE | "None.">
- **Just below sufficient** — Looks like: <sentence>. Confirmed by: <method — SHOWN | ONLY SILENCE | "None.">
- ── Sufficient Bar ──
- **Just above sufficient** — Looks like: <sentence>. Confirmed by: <method | "None.">
- **Well above sufficient** — Looks like: <sentence>. Confirmed by: <method | "None.">
- **Clarity rating:** <1–5> — <one sentence>
- **Document's stated logic:** <sentence + where — or "Not stated.">
- **Alternative pathways (max 2):** 1. <...> 2. <...>
- **Missing / could be added (max 2):** 1. <...> 2. <...>

<repeat for each criterion>

## Overall Judgement (synthesis review)

- **Stated synthesis logic:** <sentence + where — or "Not stated.">
- **Decisions attached:** <or "Not stated.">
- **Judgements this document could currently support:** <...>
- **Judgements this document could NOT currently support:** <...>
- **Single most valuable addition:** <one sentence>

## Clarity notes

- **<Criterion> — <conclusion>:** evidence may not provide confident clarity for this conclusion.
<or "None identified.">

NOTES: <max 3 lines>
```
