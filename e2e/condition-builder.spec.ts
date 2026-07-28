import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Slice 13 — the rubric-cell condition builder (R-COND-1–12). Covers the four
 * acceptance scenarios (DEV-PROMPT-SLICE-13-14 Part H): build a condition from
 * clicks, edit a term, toggle Boolean ↔ Prose without data loss, handle a
 * typed syntax error, and confirm conditions reach the Markdown and JSON
 * exports and survive a reload. Conditions are never executed here — the app
 * validates and renders; Slice 14 is the only place that runs them.
 */

/** Build a single-criterion framework with one Evidence/Method, stopping on the
 *  connect step (J10) where the condition builder lives. */
async function buildToConnect(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByTestId("project-name").fill("Condition Project");
  await page.getByTestId("create-project").click();
  await page.getByTestId("eq-title").fill("Reading program quality");
  await page.getByTestId("create-eq").click();
  await page.getByTestId("question-text").fill("How good is the reading program?");
  await page.getByTestId("question-continue").click();
  await page.getByTestId("column-label-1").fill("Insufficient");
  await page.getByTestId("column-label-2").fill("Sufficient");
  await page.getByTestId("continuum-continue").click();
  await page.getByTestId("choose-criteria").click();
  await page.getByTestId("add-node").click();
  await page.getByTestId("node-name-0").fill("Teaching quality");
  await page.getByTestId("nodes-continue").click();
  await page.getByTestId("cell-description-1").fill("Unstructured lessons.");
  await page.getByTestId("cell-description-2").fill("Structured lessons.");
  await page.getByTestId("criterion-continue").click();
  await page.getByTestId("review-continue").click();
  await page.getByTestId("method-name").fill("Classroom observation");
  await page.getByTestId("method-what").fill("Observe ten lessons.");
  await page.getByTestId("fit-justification").fill("Observes teaching directly.");
  await page.getByTestId("attach-evidence").click();
  await page.getByTestId("evidence-continue").click();
  await page.getByTestId("mixed-continue").click();
  await page.getByTestId("choose-list").click();
  await page.getByTestId("data-description-0").fill("Observation notes.");
  await page.getByTestId("evidence-continue").click();
  await expect(page.getByTestId("condition-panel")).toBeVisible();
}

test("condition builder: build, edit, toggle, error-handle, export, persist", async ({
  page,
}) => {
  await buildToConnect(page);

  // Boolean mode is the default because the node has an Evidence/Method (R-COND-1)
  await expect(page.getByTestId("condition-mode-boolean")).toBeChecked();

  // --- Scenario 1: build a condition from clicks on the "Sufficient" cell -----
  // Term 1: [Classroom observation] is Strong
  await page.getByTestId("bool-2-add-and").click();
  await expect(page.getByTestId("cond-modal-element")).toBeVisible();
  await page
    .getByTestId("cond-modal-element")
    .selectOption({ label: "[Classroom observation]" });
  await page.getByTestId("cond-modal-comparator").selectOption({ label: "is" });
  await page.getByTestId("cond-modal-value").selectOption("Strong");
  await page.getByTestId("cond-modal-save").click();
  await expect(page.getByTestId("bool-2-term-0")).toContainText(
    "[Classroom observation] is Strong",
  );

  // Term 2 (AND): [Scenario Clarity] is at least 3 — a context-aware numeric value
  await page.getByTestId("bool-2-add-and").click();
  await page.getByTestId("cond-modal-element").selectOption({ label: "[Scenario Clarity]" });
  await page.getByTestId("cond-modal-comparator").selectOption({ label: "is at least" });
  await page.getByTestId("cond-modal-value").fill("3");
  await page.getByTestId("cond-modal-save").click();
  await expect(page.getByTestId("bool-2-term-1")).toContainText(
    "[Scenario Clarity] is at least 3",
  );
  await expect(page.getByTestId("bool-2-chain")).toContainText("and");

  // A defeasible qualifier (R-COND-6): a free-text warrant
  await page.getByTestId("bool-2").getByText("Defeasible qualifiers (optional)").click();
  await page.getByTestId("bool-2-warrant").fill("Strong observed teaching is the core signal.");

  // --- Scenario 2: edit a term, then toggle modes without losing data ---------
  await page.getByTestId("bool-2-term-0-edit").click();
  await page.getByTestId("cond-modal-value").selectOption("Good");
  await page.getByTestId("cond-modal-save").click();
  await expect(page.getByTestId("bool-2-term-0")).toContainText(
    "[Classroom observation] is Good",
  );

  // Toggle to Prose: the boolean chain disappears, a prose box appears
  await page.getByTestId("condition-mode-prose").check();
  await expect(page.getByTestId("bool-2-chain")).toHaveCount(0);
  await page.getByTestId("prose-2").fill("When observation shows sustained structure.");

  // Toggle back to Boolean: the prose box goes, the boolean condition returns intact
  await page.getByTestId("condition-mode-boolean").check();
  await expect(page.getByTestId("bool-2-term-0")).toContainText(
    "[Classroom observation] is Good",
  );
  await expect(page.getByTestId("bool-2-term-1")).toContainText(
    "[Scenario Clarity] is at least 3",
  );

  // --- Scenario 4: a typed syntax error is surfaced, not silently swallowed ---
  await page.getByTestId("bool-1").getByText("Type a condition instead").click();
  await page.getByTestId("bool-1-typed").fill("([Classroom observation] is Strong");
  await page.getByTestId("bool-1-typed-apply").click();
  await expect(page.getByTestId("bool-1-typed-error").first()).toContainText(
    "Unmatched opening parenthesis",
  );
  // Fixing the input and re-applying clears the error and builds the term
  await page.getByTestId("bool-1-typed").fill("[Classroom observation] is not Strong");
  await page.getByTestId("bool-1-typed-apply").click();
  await expect(page.getByTestId("bool-1-typed-error")).toHaveCount(0);
  await expect(page.getByTestId("bool-1-term-0")).toContainText(
    "[Classroom observation] is not Strong",
  );

  // Finish the connect step so the framework is navigable
  await page.getByTestId("add-scenario-1").click();
  await page.getByTestId("scenario-1-0").fill("Notes show unfocused lessons.");
  await page.getByTestId("add-scenario-2").click();
  await page.getByTestId("scenario-2-0").fill("Notes show focused lessons.");
  await page.getByTestId("connect-continue").click();
  await page.getByTestId("decline-synthesis").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  // --- Scenario 3: exports carry the conditions -------------------------------
  await page.getByTestId("home-outputs").click();
  const [md] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-markdown").click(),
  ]);
  const markdown = readFileSync(await md.path(), "utf8");
  expect(markdown).toContain("_Condition:_ [Classroom observation] is Good and [Scenario Clarity] is at least 3");
  await page.getByTestId("outputs-back-home").click();

  // JSON export (the whole Project, embedding the EQ) includes the condition
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-project").click(),
  ]);
  const saved = JSON.parse(readFileSync(await json.path(), "utf8")) as {
    schemaVersion: number;
    evaluationQuestions: {
      schemaVersion: number;
      mesoLayers: { nodes: { cells: { condition?: { mode: string; booleanLogic?: { plainEnglish: string } } }[] }[] }[];
    }[];
  };
  expect(saved.schemaVersion).toBe(2); // Project file
  const eq = saved.evaluationQuestions[0]!;
  expect(eq.schemaVersion).toBe(3); // embedded EQ
  const conditions = eq.mesoLayers
    .flatMap((l) => l.nodes)
    .flatMap((n) => n.cells)
    .map((c) => c.condition?.booleanLogic?.plainEnglish)
    .filter(Boolean);
  expect(conditions).toContain(
    "[Classroom observation] is Good and [Scenario Clarity] is at least 3",
  );

  // --- Persistence: reload restores the condition (autosave) ------------------
  await page.reload();
  await expect(page.getByTestId("home-window")).toBeVisible();
  const persisted = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("efb.autosave.evalq.v1")!) as {
      mesoLayers: { nodes: { cells: { condition?: { booleanLogic?: { plainEnglish: string } } }[] }[] }[];
    };
    return doc.mesoLayers
      .flatMap((l) => l.nodes)
      .flatMap((n) => n.cells)
      .map((c) => c.condition?.booleanLogic?.plainEnglish)
      .filter(Boolean);
  });
  expect(persisted).toContain(
    "[Classroom observation] is Good and [Scenario Clarity] is at least 3",
  );
});
