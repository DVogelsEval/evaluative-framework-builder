import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Slice 14 — the Simulate Judgement window (R-SIM-1–8, owner Q60/Q61). Builds a
 * fully-qualified (all-rubric, conditioned) framework through the real wizard,
 * including Boolean conditions on the Overall Judgement, then exercises the
 * sandbox: gating, the fold-up to a SIMULATED Overall Judgement, unknown
 * propagation, and non-persistence after export + reload. Conditions are
 * executed **only** here — everywhere else they are documentation.
 */

async function freshStart(page: Page) {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/** Build through the shared steps up to the evidence tier choice, leaving the
 *  page on the evidence view with the tier fork visible. */
async function buildToTierChoice(page: Page) {
  await page.getByTestId("project-name").fill("Sim Project");
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
}

/** Add one condition term via the shared modal. */
async function addTerm(
  page: Page,
  boolTestId: string,
  elementLabel: string,
  comparatorLabel: string,
  value: { select: string } | { column: string },
) {
  await page.getByTestId(`${boolTestId}-add-and`).click();
  await expect(page.getByTestId("cond-modal-element")).toBeVisible();
  await page.getByTestId("cond-modal-element").selectOption({ label: elementLabel });
  await page.getByTestId("cond-modal-comparator").selectOption({ label: comparatorLabel });
  if ("select" in value) {
    await page.getByTestId("cond-modal-value").selectOption(value.select);
  } else {
    await page.getByTestId("cond-modal-value").selectOption({ label: value.column });
  }
  await page.getByTestId("cond-modal-save").click();
}

/** Build a complete single-criterion framework with a rubric evidence tier,
 *  Boolean conditions on both criterion cells, and a Boolean condition on the
 *  Overall Judgement's top column — landing on the Home Window. */
async function buildQualifiedFramework(page: Page) {
  await buildToTierChoice(page);
  await page.getByTestId("choose-rubric").click();
  await page.getByTestId("evidence-column-label-1").fill("Weak");
  await page.getByTestId("evidence-column-label-2").fill("Strong");
  await page.getByTestId("evidence-cell-0-1").fill("Little structure observed.");
  await page.getByTestId("evidence-cell-0-2").fill("Consistent structure observed.");
  await page.getByTestId("evidence-continue").click();

  // Conditions on the two criterion cells (connect / J10).
  await expect(page.getByTestId("condition-panel")).toBeVisible();
  await addTerm(page, "bool-2", "[Classroom observation]", "is at or above", { select: "Good" });
  await addTerm(page, "bool-1", "[Classroom observation]", "is below", { select: "Good" });
  await expect(page.getByTestId("bool-2-term-0")).toContainText(
    "[Classroom observation] is at or above Good",
  );
  await page.getByTestId("add-scenario-1").click();
  await page.getByTestId("scenario-1-0").fill("Notes show unfocused lessons.");
  await page.getByTestId("add-scenario-2").click();
  await page.getByTestId("scenario-2-0").fill("Notes show focused lessons.");
  await page.getByTestId("connect-continue").click();

  // Synthesis: accept, name the top column, add a Boolean condition referencing
  // the criterion's conclusion, and satisfy the step with the free-text escape.
  await page.getByTestId("accept-synthesis").click();
  await page.getByTestId("syn-column-label-4").fill("Pass");
  await page.getByText("Boolean conditions for each judgement level").click();
  await addTerm(page, "judgement-bool-4", "[Teaching quality]", "is at or above", {
    column: "Sufficient",
  });
  await expect(page.getByTestId("judgement-bool-4-term-0")).toContainText(
    "[Teaching quality] is at or above Sufficient",
  );
  await page.getByTestId("syn-free-text").fill("Overall: pass when teaching is sufficient.");
  await page.getByTestId("synthesis-continue").click();
  await expect(page.getByTestId("home-window")).toBeVisible();
}

test("simulate: gating disables the entry point for a Data-Description-List node", async ({
  page,
}) => {
  await freshStart(page);
  await buildToTierChoice(page);
  // Choose a list tier — no levels to fold, so Simulate must be gated.
  await page.getByTestId("choose-list").click();
  await page.getByTestId("data-description-0").fill("Observation notes.");
  await page.getByTestId("evidence-continue").click();
  await page.getByTestId("add-scenario-1").click();
  await page.getByTestId("scenario-1-0").fill("Unfocused.");
  await page.getByTestId("add-scenario-2").click();
  await page.getByTestId("scenario-2-0").fill("Focused.");
  await page.getByTestId("connect-continue").click();
  await page.getByTestId("decline-synthesis").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  const simulate = page.getByTestId("home-simulate");
  await expect(simulate).toBeVisible();
  await expect(simulate).toBeDisabled();
  await expect(page.getByTestId("home-simulate-reasons")).toContainText("Data Description List");
});

test("simulate: folds evidence up to a SIMULATED Overall Judgement, with unknown propagation and non-persistence", async ({
  page,
}) => {
  await freshStart(page);
  await buildQualifiedFramework(page);

  // Entry point is enabled; open the sandbox.
  const simulate = page.getByTestId("home-simulate");
  await expect(simulate).toBeEnabled();
  await simulate.click();
  await expect(page.getByTestId("simulate-window")).toBeVisible();
  await expect(page.getByTestId("sim-banner")).toContainText("Test values only");

  // Opens blank — no test value carried in (R-SIM-7).
  await expect(page.getByTestId("sim-input-0-0")).toHaveValue("");
  await expect(page.getByTestId("sim-overall-status")).toContainText("Cannot determine");

  // Set the evidence level to Strong → criterion resolves Sufficient → Pass.
  await page.getByTestId("sim-input-0-0").selectOption("Strong");
  await expect(page.getByTestId("sim-node-0-status")).toContainText("Sufficient");
  await expect(page.getByTestId("sim-overall-status")).toContainText("SIMULATED");
  await expect(page.getByTestId("sim-overall-status")).toContainText("Pass");

  // Unknown propagates when cleared (R-SIM-4).
  await page.getByTestId("sim-clear").click();
  await expect(page.getByTestId("sim-input-0-0")).toHaveValue("");
  await expect(page.getByTestId("sim-node-0-status")).toContainText("Cannot determine");
  await expect(page.getByTestId("sim-overall-status")).toContainText("Cannot determine");

  // Set a value again, then export + reload to prove non-persistence (R-SIM-7).
  await page.getByTestId("sim-input-0-0").selectOption("Developing");
  await page.getByTestId("sim-exit").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-project").click(),
  ]);
  const saved = readFileSync(await json.path(), "utf8");
  // The framework's own Boolean conditions ARE saved (they're framework content),
  // but no simulate test value ("Developing" was only entered in the sandbox).
  expect(saved).toContain("conditionCells");
  expect(saved).not.toContain("Developing");

  // Reload → the Simulate window opens blank (nothing carried over).
  await page.reload();
  await expect(page.getByTestId("home-window")).toBeVisible();
  await page.getByTestId("home-simulate").click();
  await expect(page.getByTestId("sim-input-0-0")).toHaveValue("");
  await expect(page.getByTestId("sim-overall-status")).toContainText("Cannot determine");
});
