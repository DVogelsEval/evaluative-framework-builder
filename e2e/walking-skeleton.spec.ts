import { expect, test } from "@playwright/test";

/**
 * The walking skeleton (ROADMAP Slice 0; R-151), kept in step with the wizard
 * as slices land. The click-path: Project → EQ → question → continuum →
 * structuring choice (J3) → node list (J4) → plain descriptions (J5) →
 * full-rubric review (J6) → evidence methods (J7) → mixed methods (J9) →
 * evidence tier (J8 — after J9, Q24 redirect) → connect evidence (J10) →
 * synthesis choice & rubric (J11) → save to disk → reload → Home Window.
 */
test("walking skeleton: create → build → save → reload → render", async ({ page }) => {
  // Remove the File System Access API so Save/Open exercise the deterministic
  // download / <input type=file> fallbacks (⚠Q48/R-015) — the real pickers open
  // native OS dialogs that a headless test can neither drive nor dismiss.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Create and name a Project (GWT-1.1)
  await page.getByTestId("project-name").fill("Demo Project");
  await page.getByTestId("create-project").click();

  // Create an Evaluation Question inside it (GWT-1.2)
  await page.getByTestId("eq-title").fill("Reading program quality");
  await page.getByTestId("create-eq").click();

  // Question step: Back is disabled on the first step; an empty question
  // blocks Continue (GWT-2.1), then write it
  await expect(page.getByTestId("wizard-back")).toBeDisabled();
  await page.getByTestId("question-continue").click();
  await expect(page.getByTestId("question-blocked")).toBeVisible();
  await page
    .getByTestId("question-text")
    .fill("How good is the school's reading program?");
  await page.getByTestId("question-continue").click();

  // Minimal continuum: 1 negative + 1 positive Column Header around the Sufficient Bar
  await expect(page.getByTestId("sufficient-bar")).toBeVisible();
  await page.getByTestId("continuum-continue").click(); // blank headers block
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByTestId("column-label-1").fill("Insufficient");
  await page.getByTestId("column-label-2").fill("Sufficient");
  await page.getByTestId("continuum-continue").click();

  // Structuring choice (J3, GWT-3.1): build around Criteria of Merit
  await page.getByTestId("choose-criteria").click();

  // Node list (J4): one criterion with its three warrant fields
  await page.getByTestId("nodes-continue").click(); // no nodes yet → blocks
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByTestId("add-node").click();
  await page.getByTestId("node-name-0").fill("Teaching quality");
  await page
    .getByTestId("node-link-question-0")
    .fill("Teaching is central to the program's quality.");
  await page.getByTestId("nodes-continue").click();

  // Plain descriptions (J5): one row at a time, gate on empty open cells
  await expect(page.getByTestId("traffic-panel")).toBeVisible();
  await page.getByTestId("criterion-continue").click(); // empty open cells block
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page
    .getByTestId("cell-description-1")
    .fill("Lessons are unstructured and pupils are disengaged.");
  await page
    .getByTestId("cell-description-2")
    .fill("Lessons are structured and most pupils are engaged.");
  await page.getByTestId("criterion-continue").click();

  // Full-rubric review (J6): all rows visible, then confirm and move on
  await expect(page.getByTestId("review-grid")).toBeVisible();
  await expect(page.getByTestId("review-row-0")).toContainText("Teaching quality");
  await page.getByTestId("review-continue").click();

  // Wizard Back is ungated: step back twice, then Continue re-walks the
  // already-completed gates forward again — up to, never past, the frontier
  await page.getByTestId("wizard-back").click(); // evidence → review
  await expect(page.getByTestId("review-grid")).toBeVisible();
  await page.getByTestId("wizard-back").click(); // review → criterion
  await expect(page.getByTestId("criterion-title")).toBeVisible();
  await page.getByTestId("criterion-continue").click();
  await page.getByTestId("review-continue").click();

  // Evidence planning (J7): rubric read-only above, one Evidence / Method below.
  // The tier section waits for the mixed-methods step (Q24 redirect).
  await expect(page.getByTestId("evidence-rubric-preview")).toBeVisible();
  await expect(page.getByTestId("tier-pending")).toBeVisible();
  await page.getByTestId("method-name").fill("Classroom observation");
  await page.getByTestId("method-what").fill("Observe ten reading lessons.");
  await page
    .getByTestId("fit-justification")
    .fill("Directly observes the quality of teaching.");
  await page.getByTestId("attach-evidence").click();

  // Mixed-methods step (J9) comes before the evidence tier (Q24 redirect):
  // decline it — "no mixed methods" (R-163/R-164)
  await page.getByTestId("evidence-continue").click();
  await expect(page.getByTestId("opt-combine")).toBeVisible();
  await page.getByTestId("mixed-continue").click();

  // Evidence-tier fork (J8), back on the same node: missing tier blocks, then
  // a Data Description List pre-populated with one row per linked method —
  // no add-entry button (2026-07-14 notes)
  await expect(
    page.getByText("Choose how to explain value within each evidence source"),
  ).toBeVisible();
  await page.getByTestId("evidence-continue").click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByTestId("choose-list").click();
  await expect(page.getByTestId("data-entry-method-0")).toHaveText(
    "Classroom observation",
  );
  // The auto row starts empty, so the per-method completeness still gates (Q37)
  await page.getByTestId("evidence-continue").click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page
    .getByTestId("data-description-0")
    .fill("Structured observation notes for ten reading lessons.");
  await page.getByTestId("evidence-continue").click();

  // Connect evidence to conclusions (J10): open cells without a Scenario block (R-097)
  await expect(page.getByTestId("methods-panel")).toBeVisible();
  await page.getByTestId("connect-continue").click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  // One prose Scenario per open cell (GWT-10.1/10.2)
  await page.getByTestId("add-scenario-1").click();
  await page
    .getByTestId("scenario-1-0")
    .fill("Observation notes show unfocused lessons in most classes.");

  // Click-to-insert (Q41): clicking a method drops its name into the focused
  // scenario's prose as a bold inline token; the requirement is typed after it
  await page.getByTestId("add-scenario-2").click();
  await page.getByTestId("scenario-2-0").click();
  await page.getByTestId("ref-method-Classroom observation").click();
  await expect(
    page.getByTestId("scenario-2-0").locator("b[data-token-id]"),
  ).toHaveText("Classroom observation");
  await page.keyboard.type("shows structured lessons in most classes.");
  await expect(page.getByTestId("evidence-cell-2")).toContainText(
    "Classroom observation shows structured lessons in most classes.",
  );

  // Clarity 1–3 fires the add-evidence prompt; declining records the note
  // (GWT-10.3/10.4); a 4–5 rating fires no prompt
  await page.getByTestId("clarity-2-2").check();
  await expect(page.getByTestId("clarity-prompt-2")).toBeVisible();
  await page.getByTestId("clarity-decline-2").click();
  await expect(page.getByTestId("clarity-note-2")).toHaveValue(
    /may not provide confident clarity/,
  );
  await page.getByTestId("clarity-1-5").check();
  await expect(page.getByTestId("clarity-prompt-1")).not.toBeVisible();
  await page.getByTestId("connect-continue").click();

  // Overall Judgement choice (J11): declining exits to the Home Window with
  // outputs exportable (GWT-11.1)
  await page.getByTestId("decline-synthesis").click();
  await expect(page.getByTestId("home-window")).toBeVisible();
  await expect(page.getByTestId("save-project")).toBeVisible();

  // Changed their mind: the Home Window re-offers the synthesis; accepting
  // opens the rubric — 2 columns each side of the bar (GWT-11.2), rows Header ·
  // Decision · plain description · criterion conditions (GWT-11.3)
  await page.getByTestId("home-add-synthesis").click();
  await page.getByTestId("accept-synthesis").click();
  await expect(page.getByTestId("synthesis-grid")).toBeVisible();
  await expect(page.getByTestId("syn-sufficient-bar")).toBeVisible();
  await expect(page.getByTestId("syn-decision-toggle")).toBeChecked();

  // The ⚠Q45 gate: headers and plain descriptions incomplete → Continue blocks
  await page.getByTestId("synthesis-continue").click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  for (const i of [1, 2, 3, 4]) {
    await page.getByTestId(`syn-column-label-${i}`).fill(`Level ${i}`);
    await page.getByTestId(`syn-plain-${i}`).fill(`The overall judgement at level ${i}.`);
  }
  await page.getByTestId("syn-decision-4").fill("Recommend the program continues.");

  // The criteria click-panel is greyed out until a criterion-conditions
  // scenario is focused (2026-07-14 notes)
  await expect(page.getByTestId("synthesis-meso-panel")).toHaveClass(
    /click-panel-disabled/,
  );

  // Criterion connection (GWT-11.4): click into a scenario, then click the
  // criterion's cell in the meso rubric alongside — "«name» is «header»" lands
  // bold in the prose (Q44 redirect), and the requirement is typed after it
  await page.getByTestId("syn-add-scenario-4").click();
  await page.getByTestId("syn-scenario-4-0").click();
  await expect(page.getByTestId("synthesis-meso-panel")).not.toHaveClass(
    /click-panel-disabled/,
  );
  await page.getByTestId("meso-cell-0-2").click();
  await expect(
    page.getByTestId("syn-scenario-4-0").locator("b[data-token-id]"),
  ).toHaveText("Teaching quality is Sufficient");

  // The ⚠Q47 operator dropdown inserts plain prose text at the caret
  await page.getByTestId("syn-operator-4-0").selectOption("or above");
  await page.keyboard.type("and ");

  // Collective clause (GWT-11.5): the "all other criteria" group reference
  await page.getByTestId("insert-all-other").click();
  await expect(
    page.getByTestId("syn-scenario-4-0").locator("b.prose-collective"),
  ).toHaveText("all other criteria");
  await page.keyboard.type("clear the bar.");
  await expect(page.getByTestId("syn-conditions-4")).toContainText(
    "Teaching quality is Sufficient or above and all other criteria clear the bar.",
  );
  await page.getByTestId("synthesis-continue").click();

  // Bare Home Window: question at top, the judgement, node and evidence boxes
  await expect(page.getByTestId("home-window")).toBeVisible();
  await expect(page.getByTestId("home-judgement")).toBeVisible();
  await expect(page.getByTestId("home-question")).toHaveText(
    "How good is the school's reading program?",
  );
  await expect(page.getByTestId("home-node-0")).toContainText("Teaching quality");
  await expect(page.getByTestId("home-evidence")).toContainText("Classroom observation");

  // Slice 9: the Home Window is a map-with-lines SVG with connecting lines
  await expect(page.getByTestId("home-map")).toBeVisible();
  expect(
    await page.getByTestId("home-map").locator("line.home-map-edge").count(),
  ).toBeGreaterThan(0);

  // The boxes are clickable and drill into their editors (R-126/R-127)
  await page.getByTestId("home-node-0").click();
  await expect(page.getByTestId("cell-description-1")).toHaveValue(
    "Lessons are unstructured and pupils are disengaged.",
  );
  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  // Drilling an evidence box opens that node's evidence view (evidence↔node tier)
  await page.getByTestId("home-evidence").click();
  await expect(page.getByTestId("evidence-rubric-preview")).toBeVisible();
  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  // The map is exportable to SVG (R-124, closing ⚠Q52)
  const [svgDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-map-svg").click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe("reading-program-quality-map.svg");

  // Outputs & exports (J12, Slice 8): open the Outputs surface from Home. The
  // Evidence Matrix lists the method against the criterion (GWT-12.1), and an
  // editable Markdown export downloads (GWT-12.5, ⚠Q48 download fallback).
  await page.getByTestId("home-outputs").click();
  await expect(page.getByTestId("outputs-view")).toBeVisible();
  await expect(page.getByTestId("evidence-matrix")).toContainText("Classroom observation");
  await expect(page.getByTestId("evidence-matrix")).toContainText("Teaching quality");
  await expect(page.getByTestId("output-b")).toContainText("Teaching quality");

  // Justifications are criterion-first and carry the criterion's warrant boxes —
  // J4's link-to-question text, previously in no output, now surfaces (Q51)
  await expect(page.getByTestId("justifications-table")).toContainText("Teaching quality");
  await expect(page.getByTestId("justifications-table")).toContainText(
    "Teaching is central to the program's quality.",
  );

  // The Sufficient Bar is drawn in Output B (Q51 note 2), and stays visible when
  // the layout toggle transposes the rubric to horizontal (Q51 note 3)
  await expect(page.getByTestId("output-sufficient-bar").first()).toBeVisible();
  await page.getByTestId("layout-horizontal").click();
  await expect(page.getByTestId("output-sufficient-bar").first()).toBeVisible();
  await expect(page.getByTestId("output-b")).toContainText("Teaching quality");
  await page.getByTestId("layout-vertical").click();

  const [mdDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-markdown").click(),
  ]);
  expect(mdDownload.suggestedFilename()).toBe("reading-program-quality.md");
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv").click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe("reading-program-quality.csv");
  await page.getByTestId("outputs-back-home").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  // Save to disk: one Save writes the whole Project (every EQ in one file). With
  // the File System Access API removed above, Save takes the download fallback
  // and says so (⚠Q48; the R-015 fallback path).
  const [projectDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-project").click(),
  ]);
  expect(projectDownload.suggestedFilename()).toBe("demo-project.project.json");
  await expect(page.getByTestId("save-status-project")).toContainText("Downloaded");
  const projectPath = await projectDownload.path();

  // The Open flow stays reachable from Home Window in a live session (not just
  // after clearing storage) — it lands on the Project's EQ page, and returning
  // doesn't discard the doc.
  await page.getByTestId("open-different").click();
  await expect(page.getByTestId("start-eq-page")).toBeVisible();
  await page.getByTestId("back-to-home").click();
  await expect(page.getByTestId("home-window")).toBeVisible();

  // Reload the page: autosave restores the complete framework onto the Home Window
  await page.reload();
  await expect(page.getByTestId("home-window")).toBeVisible();
  await expect(page.getByTestId("home-question")).toHaveText(
    "How good is the school's reading program?",
  );

  // Fresh browser state: open the ONE Project file — a single-EQ Project opens
  // straight in (no per-question file picking); identical state renders.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("project-name")).toBeVisible();
  await page.getByTestId("open-project-file").setInputFiles(projectPath);
  await expect(page.getByTestId("home-window")).toBeVisible();
  await expect(page.getByTestId("home-question")).toHaveText(
    "How good is the school's reading program?",
  );
  await expect(page.getByTestId("home-node-0")).toContainText("Teaching quality");
  await expect(page.getByTestId("home-evidence")).toContainText("Classroom observation");
  await expect(page.getByTestId("header-project")).toHaveText("Demo Project");
});

/**
 * Slice 7 — the second meso layer (GWT-3.2–3.4, R-045–R-047, Q3/Q4/Q33). Build a
 * single-criterion framework to the synthesis juncture, then *grow* a Components
 * layer above the criteria, roll the criterion up into a component, and confirm
 * the Overall Judgement now synthesises the **component** (its cell drops
 * "«Component» is «Header»" into the scenario) — not the criterion.
 */
test("second meso layer: grow components, roll up, synthesise the superior layer", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Minimal single-criterion framework through the connect step
  await page.getByTestId("project-name").fill("Two-Layer Project");
  await page.getByTestId("create-project").click();
  await page.getByTestId("eq-title").fill("Program quality");
  await page.getByTestId("create-eq").click();
  await page.getByTestId("question-text").fill("How good is the program?");
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
  await page.getByTestId("method-what").fill("Observe lessons.");
  await page.getByTestId("fit-justification").fill("Observes teaching.");
  await page.getByTestId("attach-evidence").click();
  await page.getByTestId("evidence-continue").click();
  await page.getByTestId("mixed-continue").click();
  await page.getByTestId("choose-list").click();
  await page.getByTestId("data-description-0").fill("Observation notes.");
  await page.getByTestId("evidence-continue").click();
  await page.getByTestId("add-scenario-1").click();
  await page.getByTestId("scenario-1-0").fill("Notes show unfocused lessons.");
  await page.getByTestId("add-scenario-2").click();
  await page.getByTestId("scenario-2-0").fill("Notes show focused lessons.");
  await page.getByTestId("connect-continue").click();

  // Synthesis choice offers the R-099 "group under a higher layer" path (GWT-3.2)
  await page.getByTestId("grow-second-layer").click();
  await expect(page.getByTestId("second-layer-offer")).toBeVisible();
  await page.getByTestId("add-components-layer").click();

  // The editor: author the component layer's conclusions and one component,
  // then roll the criterion up into it (GWT-3.3, R-046)
  await expect(page.getByTestId("second-layer-editor")).toBeVisible();
  await page.getByTestId("superior-column-1").fill("Weak");
  await page.getByTestId("superior-column-2").fill("Strong");
  await page.getByTestId("add-superior-node").click();
  await page.getByTestId("superior-node-name-0").fill("Delivery");

  // Rollup is required before continuing
  await page.getByTestId("second-layer-continue").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByTestId("rollup-select-0").selectOption({ label: "Delivery" });

  // Inter-layer connect pass (Q53/Q54): once every criterion is rolled up,
  // connect the criterion conclusions "up" into the component the same way
  // evidence connects to criteria (J10). Click into a component scenario, then
  // click the criterion's cell — "«criterion» is «conclusion»" lands bold, and
  // the requirement is typed after it. Encouraged, never gated.
  await expect(page.getByTestId("interlayer-connect")).toBeVisible();
  await page.getByTestId("superior-add-scenario-0-2").click();
  await page.getByTestId("superior-scenario-0-2-0").click();
  await page.getByTestId("sub-cell-0-2").click();
  await expect(
    page.getByTestId("superior-scenario-0-2-0").locator("b[data-token-id]"),
  ).toHaveText("Teaching quality is Sufficient");
  await page.keyboard.type("makes Delivery strong.");
  await page.getByTestId("second-layer-continue").click();

  // Back at the synthesis choice — now judging the components; accept it
  await page.getByTestId("accept-synthesis").click();
  await expect(page.getByTestId("synthesis-grid")).toBeVisible();
  for (const i of [1, 2, 3, 4]) {
    await page.getByTestId(`syn-column-label-${i}`).fill(`Level ${i}`);
    await page.getByTestId(`syn-plain-${i}`).fill(`The judgement at level ${i}.`);
  }

  // Both meso layers now feed the one Overall Judgement (Q53): the click-panel
  // lists the COMPONENT (Delivery) *and* the CRITERION (Teaching quality).
  // Reference both in one scenario — each token resolves against its OWN layer's
  // continuum (Delivery is Strong from the superior layer; Teaching quality is
  // Sufficient from the subordinate layer).
  await expect(page.getByTestId("synthesis-meso-panel")).toContainText("Delivery");
  await expect(page.getByTestId("synthesis-meso-panel")).toContainText("Teaching quality");
  await page.getByTestId("syn-add-scenario-4").click();
  await page.getByTestId("syn-scenario-4-0").click();
  await page.getByTestId("meso-cell-0-2").click();
  await expect(
    page.getByTestId("syn-scenario-4-0").locator("b[data-token-id]").first(),
  ).toHaveText("Delivery is Strong");
  await page.keyboard.type("and ");
  await page.getByTestId("meso-cell-sub-0-2").click();
  await expect(
    page.getByTestId("syn-scenario-4-0").locator("b[data-token-id]").nth(1),
  ).toHaveText("Teaching quality is Sufficient");
  await page.keyboard.type("both hold.");
  await expect(page.getByTestId("syn-conditions-4")).toContainText(
    "Delivery is Strong and Teaching quality is Sufficient both hold.",
  );
  await page.getByTestId("synthesis-continue").click();

  // Home Window shows the component tier above the criterion (GWT-3.2)
  await expect(page.getByTestId("home-window")).toBeVisible();
  await expect(page.getByTestId("home-superior-node-0")).toContainText("Delivery");
  await expect(page.getByTestId("home-node-0")).toContainText("Teaching quality");

  // Reload: autosave restores the two-layer framework
  await page.reload();
  await expect(page.getByTestId("home-superior-node-0")).toContainText("Delivery");
});

/**
 * Slice 10 — the persistent per-EQ Notes pop-out (R-030, Q19). The Notes button
 * is present in every view; the panel is one area per EQ, stays put across view
 * changes, and survives a reload via autosave.
 */
test("notes pop-out: one per EQ, reachable from every view, autosaved", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByTestId("project-name").fill("Notes Project");
  await page.getByTestId("create-project").click();
  await page.getByTestId("eq-title").fill("Notes EQ");
  await page.getByTestId("create-eq").click();

  // On the question view, the Notes button opens the per-EQ pop-out
  await page.getByTestId("notes-toggle").click();
  await expect(page.getByTestId("notes-panel")).toBeVisible();
  await page.getByTestId("notes-textarea").fill("Ask about the sample size.");

  // Move to the Home Window — the same notes stay open with their text
  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("notes-textarea")).toHaveValue(
    "Ask about the sample size.",
  );

  // Reload: autosave restored the notes; reopen and confirm they persisted
  await page.reload();
  await page.getByTestId("notes-toggle").click();
  await expect(page.getByTestId("notes-textarea")).toHaveValue(
    "Ask about the sample size.",
  );
});

/**
 * Slice 10 — RecycleBin restore (R-149/Q18/⚠Q56). Delete a criterion, then bring
 * it back from the Deleted view: the item leaves the list, a "Restored" status
 * shows, and the criterion is back in the (autosaved) framework.
 */
test("recycle bin: delete a criterion, then restore it from the Deleted view", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByTestId("project-name").fill("Restore Project");
  await page.getByTestId("create-project").click();
  await page.getByTestId("eq-title").fill("Restore EQ");
  await page.getByTestId("create-eq").click();
  await page.getByTestId("question-text").fill("How good is it?");
  await page.getByTestId("question-continue").click();
  await page.getByTestId("column-label-1").fill("Insufficient");
  await page.getByTestId("column-label-2").fill("Sufficient");
  await page.getByTestId("continuum-continue").click();
  await page.getByTestId("choose-criteria").click();

  // Two criteria, then delete the second → RecycleBin (Invariant 20)
  await page.getByTestId("add-node").click();
  await page.getByTestId("node-name-0").fill("Teaching quality");
  await page.getByTestId("add-node").click();
  await page.getByTestId("node-name-1").fill("Access");
  await page.getByTestId("remove-node-1").click();
  await expect(page.getByTestId("node-name-1")).toHaveCount(0);

  // Home → Deleted view: the criterion is listed and restorable
  await page.getByTestId("go-home").click();
  await page.getByTestId("home-deleted").click();
  await expect(page.getByTestId("deleted-view")).toBeVisible();
  await expect(page.getByTestId("deleted-item-0")).toContainText("Access");
  await page.getByTestId("restore-item-0").click();
  await expect(page.getByTestId("restore-status")).toContainText("Restored");
  await expect(page.getByTestId("deleted-empty")).toBeVisible();

  // The criterion is back in the framework (autosaved)
  const names = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("efb.autosave.evalq.v1")!) as {
      mesoLayers: { tierOrder: number; nodes: { name: string }[] }[];
    };
    return doc.mesoLayers
      .find((l) => l.tierOrder === 0)!
      .nodes.map((n) => n.name);
  });
  expect(names).toContain("Access");
});

/**
 * Slice 11 — AI hand-off / prompt-out (R-139–R-141; AI-HANDOFF.md). From the
 * Home Window (available mid-build) open the AI hand-off surface, confirm the
 * composed prompt serialises the chosen target's context (the question for the
 * EQ, the continuum + Sufficient Bar for the continuum target), and that
 * Copy reports a status. Nothing is ever sent or auto-applied.
 */
test("ai hand-off: compose a prompt per target and copy it out", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // A minimal, still-being-built framework: question + continuum + one criterion
  await page.getByTestId("project-name").fill("Hand-off Project");
  await page.getByTestId("create-project").click();
  await page.getByTestId("eq-title").fill("Hand-off EQ");
  await page.getByTestId("create-eq").click();
  await page.getByTestId("question-text").fill("How good is the reading program?");
  await page.getByTestId("question-continue").click();
  await page.getByTestId("column-label-1").fill("Insufficient");
  await page.getByTestId("column-label-2").fill("Sufficient");
  await page.getByTestId("continuum-continue").click();
  await page.getByTestId("choose-criteria").click();
  await page.getByTestId("add-node").click();
  await page.getByTestId("node-name-0").fill("Teaching quality");

  // Home mid-build → open the AI hand-off surface
  await page.getByTestId("go-home").click();
  await page.getByTestId("home-ai-handoff").click();
  await expect(page.getByTestId("ai-handoff-view")).toBeVisible();

  // Default target is the Evaluation Question — the prompt carries the question
  await expect(page.getByTestId("ai-prompt-preview")).toContainText(
    "How good is the reading program?",
  );

  // Switch to the continuum target — its prompt serialises the Sufficient Bar
  await page.getByTestId("ai-target-select").selectOption({ label: "Value continuum" });
  await expect(page.getByTestId("ai-prompt-preview")).toContainText("Insufficient");
  await expect(page.getByTestId("ai-prompt-preview")).toContainText("Sufficient Bar");
  // The prompt still ends with the required-return layout, never AI output
  await expect(page.getByTestId("ai-prompt-preview")).toContainText("RESPOND EXACTLY");

  // Copy reports a status; the template can be customised in place
  await page.getByTestId("ai-copy-prompt").click();
  await expect(page.getByTestId("ai-status")).toContainText("clipboard");
  await page.getByTestId("ai-customise-toggle").click();
  await expect(page.getByTestId("ai-template-source")).toContainText("appliesTo: continuum");

  // Back to the Home Window
  await page.getByTestId("ai-handoff-back-home").click();
  await expect(page.getByTestId("home-window")).toBeVisible();
});
