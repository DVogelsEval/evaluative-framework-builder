import { orderedColumns } from "./continuum";
import { subordinateLayer } from "./layers";
import { SIMULATED_LABEL } from "./simCase";
import { frameworkPlacementForCase } from "./simCaseFold";
import type { EvaluationQuestion } from "./schema";

/**
 * The review artefact (V2 Phase 2.3, extension spec §5.3): a SINGLE self-
 * contained HTML file — all CSS/JS inlined, zero network requests, no
 * analytics. Not a second app; this module just returns a string. The
 * reviewer opens it locally, sorts each Case onto a level, writes an
 * optional objection, then downloads a critique JSON. Nothing is
 * transmitted anywhere from here.
 *
 * BOUNDARY NOTE (read alongside docs/SPEC_MAPPING.md §3.3): "the framework's
 * placement" is computed by simCaseFold.ts, which imports simulateEvaluate.ts
 * — that is fine here, since neither this module nor simCaseFold.ts is one
 * of the five sensitive entries simulateBoundary.test.ts checks (store.ts,
 * persistence/local.ts, domain/output.ts, domain/serialize.ts,
 * domain/aiContext.ts). That tripwire test must still pass, unmodified.
 *
 * BLIND-FIRST (extension spec decision 7, the load-bearing rule): the
 * framework's placement for each case is never printed into the static
 * markup, never put in a `data-*` attribute, never assigned to `window`,
 * and never embedded as a labelled JSON blob. It lives only inside a
 * closure in the generated `<script>`, read solely by the reveal function
 * that runs after the reviewer has placed every case themselves.
 *
 * SCOPING DECISION: see simCaseFold.ts's own doc comment — the same
 * decision governs both this artefact and the critique-import disagreement
 * map, so they never disagree with each other.
 */
export function buildReviewArtefact(doc: EvaluationQuestion): string {
  const layer = subordinateLayer(doc);
  const columns = layer ? orderedColumns(layer.continuum) : [];
  const barAfter = layer?.continuum.sufficientBarAfterOrdinal ?? 0;
  const aboveBarLabel = columns.find((c) => c.ordinal === barAfter + 1)?.label ?? "the higher levels";
  const barStatement =
    layer?.continuum.sufficientBarDefinition?.trim() ||
    layer?.continuum.sufficientBarLabel?.trim() ||
    `"Good enough" means reaching at least "${aboveBarLabel}".`;

  const cases = doc.simCases.map((c) => ({
    id: c.id,
    label: c.label,
    prose: c.prose,
    placedColumnId: frameworkPlacementForCase(doc, c),
  }));

  const title = escapeHtml(doc.title || "Evaluation review");
  const levelOptions = columns
    .map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.label || "(unnamed level)")}</option>`)
    .join("");

  const caseBlocksHtml = cases
    .map(
      (c, i) => `
    <div class="case" data-case-index="${i}">
      <h3>${escapeHtml(c.label || "Case " + (i + 1))} <span class="tag">${SIMULATED_LABEL}</span></h3>
      <p class="prose">${escapeHtml(c.prose)}</p>
      <label>Which level does this belong at?
        <select class="placement-select" data-case-id="${escapeAttr(c.id)}">
          <option value="">— choose a level —</option>
          ${levelOptions}
        </select>
      </label>
      <label>Objection or comment (optional)
        <textarea class="objection" data-case-id="${escapeAttr(c.id)}" rows="2"></textarea>
      </label>
      <div class="reveal-slot" data-case-id="${escapeAttr(c.id)}" hidden></div>
    </div>`,
    )
    .join("\n");

  // The framework's own placements never appear above this line in the
  // static markup — everything past here is JS, and the mapping itself is
  // closure-scoped, never assigned to `window`, never re-serialised as a
  // labelled JSON blob in the page.
  const caseDataJs = JSON.stringify(cases.map((c) => ({ id: c.id, columnId: c.placedColumnId })));
  const columnLabelsJs = JSON.stringify(
    Object.fromEntries(columns.map((c) => [c.id, c.label || "(unnamed level)"])),
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title} — review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${INLINE_CSS}
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <p class="framing">You are being asked to sort a set of short, made-up cases onto levels —
  not to read the full framework behind them. For each case, pick the level you think it
  belongs at, then add an objection if you disagree with anything. Nothing you do here is sent
  anywhere; when you are done, you download a file and send it back yourself.</p>
  <p class="bar-statement"><strong>${escapeHtml(barStatement)}</strong></p>
  <label>Your name (optional, only used so your results can be told apart from other reviewers')
    <input type="text" id="reviewer-label">
  </label>
</header>

<main>
  <section id="cases">
    ${caseBlocksHtml}
  </section>

  <section id="add-case">
    <h3>Add your own case (optional)</h3>
    <label>Short name <input type="text" id="added-case-label"></label>
    <label>Describe it <textarea id="added-case-prose" rows="2"></textarea></label>
    <button type="button" id="add-case-btn">+ Add this case to the list</button>
  </section>

  <button type="button" id="reveal-btn" disabled>See how the levels were actually placed</button>
  <p id="reveal-hint" class="hint">Place every case above first.</p>

  <button type="button" id="download-btn">Download my results</button>
  <p id="download-status" class="hint" role="status"></p>
</main>

<script>
(function () {
  "use strict";
  // Closure-scoped — never on window, never re-printed into the DOM before
  // the reveal button runs this function.
  var caseAnswers = ${caseDataJs};
  var levelLabels = ${columnLabelsJs};
  var addedCases = [];

  function answerFor(caseId) {
    for (var i = 0; i < caseAnswers.length; i++) {
      if (caseAnswers[i].id === caseId) return caseAnswers[i].columnId;
    }
    return null;
  }

  function allPlaced() {
    var selects = document.querySelectorAll(".placement-select");
    for (var i = 0; i < selects.length; i++) {
      if (!selects[i].value) return false;
    }
    return selects.length > 0;
  }

  function updateRevealState() {
    var btn = document.getElementById("reveal-btn");
    var hint = document.getElementById("reveal-hint");
    var ready = allPlaced();
    btn.disabled = !ready;
    hint.style.display = ready ? "none" : "block";
  }

  document.addEventListener("change", function (e) {
    if (e.target.classList.contains("placement-select")) updateRevealState();
  });

  document.getElementById("reveal-btn").addEventListener("click", function () {
    var cases = document.querySelectorAll(".case");
    for (var i = 0; i < cases.length; i++) {
      var el = cases[i];
      var select = el.querySelector(".placement-select");
      var caseId = select.getAttribute("data-case-id");
      var reviewerColumnId = select.value;
      var frameworkColumnId = answerFor(caseId);
      var slot = el.querySelector(".reveal-slot");
      slot.hidden = false;
      if (frameworkColumnId === null) {
        slot.textContent = "This framework did not resolve a single clear level for this case.";
      } else {
        var frameworkLabel = levelLabels[frameworkColumnId] || "(unknown level)";
        var agree = reviewerColumnId === frameworkColumnId;
        slot.textContent = agree
          ? 'You agreed — both placed this at "' + frameworkLabel + '".'
          : 'You placed this differently. The levels placed it at "' + frameworkLabel + '".';
        slot.className = "reveal-slot " + (agree ? "agree" : "disagree");
      }
    }
    document.getElementById("reveal-btn").disabled = true;
  });

  document.getElementById("add-case-btn").addEventListener("click", function () {
    var label = document.getElementById("added-case-label").value.trim();
    var prose = document.getElementById("added-case-prose").value.trim();
    if (label === "" && prose === "") return;
    addedCases.push({ label: label, prose: prose });
    document.getElementById("added-case-label").value = "";
    document.getElementById("added-case-prose").value = "";
    var status = document.getElementById("download-status");
    status.textContent = addedCases.length + " added case(s) ready to include in your download.";
  });

  document.getElementById("download-btn").addEventListener("click", function () {
    var placements = [];
    var selects = document.querySelectorAll(".placement-select");
    for (var i = 0; i < selects.length; i++) {
      var caseId = selects[i].getAttribute("data-case-id");
      var placedAtColumnId = selects[i].value;
      if (!placedAtColumnId) continue;
      var objectionEl = document.querySelector('.objection[data-case-id="' + caseId + '"]');
      var objection = objectionEl ? objectionEl.value.trim() : "";
      var entry = { simCaseId: caseId, placedAtColumnId: placedAtColumnId };
      if (objection !== "") entry.objection = objection;
      placements.push(entry);
    }
    var critique = {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      reviewerLabel: document.getElementById("reviewer-label").value.trim(),
      importedAt: new Date().toISOString(),
      placements: placements,
      addedCases: addedCases
    };
    var blob = new Blob([JSON.stringify(critique, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "critique.json";
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById("download-status").textContent = "Downloaded critique.json — send this file back yourself.";
  });

  updateRevealState();
})();
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

const INLINE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 0 auto; padding: 1.5rem; line-height: 1.5; }
  header { border-bottom: 1px solid #ccc; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .framing { color: #333; }
  .bar-statement { background: #fdf6e3; border: 1px solid #d8a72a; padding: 0.6rem 0.9rem; border-radius: 4px; }
  .case { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
  .case .tag { font-size: 0.7rem; background: #333; color: #fff; padding: 0.1rem 0.4rem; border-radius: 3px; vertical-align: middle; }
  .case label { display: block; margin-top: 0.6rem; font-size: 0.9rem; }
  .case select, .case textarea, #add-case input, #add-case textarea { width: 100%; margin-top: 0.2rem; font: inherit; }
  .reveal-slot { margin-top: 0.6rem; padding: 0.5rem; border-radius: 4px; font-size: 0.9rem; }
  .reveal-slot.agree { background: #e6f4ea; }
  .reveal-slot.disagree { background: #fce8e6; }
  #add-case { border: 1px dashed #ccc; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
  button { padding: 0.5rem 1rem; margin-right: 0.5rem; margin-top: 0.5rem; cursor: pointer; }
  .hint { color: #666; font-size: 0.85rem; }
`;
