import { useState } from "react";
import {
  openJsonFromDisk,
  readEvalqFile,
  readProjectFile,
  rememberSaveHandle,
  supportsFileSystemAccess,
  type SaveFileHandle,
} from "../persistence/file";
import { useStore } from "../store/store";
import { firstIncompleteView } from "../store/wizard";

/**
 * The Start flow, two sequential pages. **Page 1 — Project page:** create a new
 * Project, or open an existing Project file. **Page 2 — Evaluation Question
 * page** (inside a loaded Project): create a new Evaluation Question, or open one
 * of the Project's questions.
 *
 * A Project is now a **single file that embeds all its Evaluation Questions**
 * (revised Q1, 2026-07-25): open one file, pick a question from the list — no
 * folder of scattered `.evalq.json` files, no per-question file picking. A lone
 * `.evalq.json` can still be opened directly (it is wrapped in a Project).
 *
 * Which page shows: page 1 when no Project is loaded, or when the user chose
 * "Switch Project" (`switching`); otherwise page 2.
 */
export function StartView() {
  const project = useStore((s) => s.project);
  const doc = useStore((s) => s.doc);
  const createProject = useStore((s) => s.createProject);
  const createEQ = useStore((s) => s.createEQ);
  const loadProject = useStore((s) => s.loadProject);
  const openEvaluationQuestion = useStore((s) => s.openEvaluationQuestion);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Show page 1 while a Project is still loaded — the "Switch Project" path. */
  const [switching, setSwitching] = useState(false);

  const showProjectPage = !project || switching;

  /** Where the File System Access API exists (Chrome/Edge) the open controls are
   *  native pickers that also register a write-back handle, so a later Save
   *  overwrites the opened file in place (R-015). Elsewhere they are
   *  `<input type=file>` uploads — the same testids either way. */
  const canPick = supportsFileSystemAccess();

  // Open a standalone `.evalq.json` — wrapped in a Project by the store.
  const openFile = async (file: File | undefined, handle?: SaveFileHandle) => {
    if (!file) return;
    try {
      const parsed = await readEvalqFile(file);
      setError(null);
      if (handle) rememberSaveHandle(parsed.id, handle);
      useStore.getState().loadDocument(parsed, useStore.getState().project);
      useStore.getState().setView(firstIncompleteView(parsed));
    } catch {
      setError("That file could not be read as a valid .evalq.json document.");
    }
  };

  // Open a Project file — loads every embedded EQ. A single-EQ Project opens
  // straight into it; otherwise the user picks from the list on page 2.
  const openProjectFile = async (file: File | undefined, handle?: SaveFileHandle) => {
    if (!file) return;
    try {
      const parsed = await readProjectFile(file);
      setError(null);
      setSwitching(false);
      if (handle) rememberSaveHandle(parsed.id, handle);
      loadProject(parsed);
      if (parsed.evaluationQuestions.length === 1) {
        openEvaluationQuestion(parsed.evaluationQuestions[0]!.id);
      }
    } catch {
      setError("That file could not be read as a valid Project file.");
    }
  };

  const pickEvalq = async () => {
    const picked = await openJsonFromDisk();
    if (picked) await openFile(picked.file, picked.handle);
  };
  const pickProject = async () => {
    const picked = await openJsonFromDisk();
    if (picked) await openProjectFile(picked.file, picked.handle);
  };

  const backToHome = doc && (
    <button
      type="button"
      className="link-button"
      data-testid="back-to-home"
      onClick={() => useStore.getState().setView("home")}
    >
      ← Back to “{doc.title}”
    </button>
  );

  const errorBlock = error && (
    <p role="alert" className="error" data-testid="start-error">
      {error}
    </p>
  );

  // ---- Page 1 — Project page --------------------------------------------------
  if (showProjectPage) {
    return (
      <section className="panel" data-testid="start-project-page">
        {backToHome}
        <h2>Start or open a Project</h2>
        <p>
          A Project is a single file that holds all of your Evaluation Questions.
          Open one Project file and pick a question to work on.
        </p>

        <div className="start-section">
          <h3>Create a new Project</h3>
          <label>
            Project name
            <input
              data-testid="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="create-project"
            onClick={() => {
              if (name.trim() === "") {
                setError("Give the Project a name first.");
                return;
              }
              setError(null);
              setName("");
              setSwitching(false);
              createProject(name.trim());
            }}
          >
            Create Project
          </button>
          {switching && (
            <p className="hint">
              Your current Project&apos;s file stays where you saved it — if you
              haven&apos;t saved it yet, do that from the Home Window first.
            </p>
          )}
        </div>

        <hr />

        <div className="start-section">
          <h3>Open an existing Project</h3>
          <p className="hint">
            Open a saved Project file — its Evaluation Questions appear as a
            clickable list.
          </p>
          {canPick ? (
            <button
              type="button"
              data-testid="open-project-file"
              onClick={() => void pickProject()}
            >
              Open a Project file…
            </button>
          ) : (
            <label>
              Choose a Project file
              <input
                type="file"
                accept=".json,application/json"
                data-testid="open-project-file"
                onChange={(e) => void openProjectFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {/* Secondary: open a single standalone .evalq.json (wrapped in a Project). */}
        <div className="start-section start-secondary">
          <h4>Have a single Evaluation Question file?</h4>
          {canPick ? (
            <button type="button" data-testid="open-file" onClick={() => void pickEvalq()}>
              Open an .evalq.json file directly…
            </button>
          ) : (
            <label>
              Open an Evaluation Question file (<code>.evalq.json</code>)
              <input
                type="file"
                accept=".json,.evalq.json,application/json"
                data-testid="open-file"
                onChange={(e) => void openFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {switching && (
          <button
            type="button"
            className="link-button"
            data-testid="cancel-switch-project"
            onClick={() => {
              setError(null);
              setSwitching(false);
            }}
          >
            ← Back to “{project?.name}”
          </button>
        )}
        {errorBlock}
      </section>
    );
  }

  // ---- Page 2 — Evaluation Question page (inside a loaded Project) -------------
  return (
    <section className="panel" data-testid="start-eq-page">
      {backToHome}
      <h2>Project: {project!.name}</h2>
      <p>
        Create a new Evaluation Question in this Project, or open one you saved
        earlier.
      </p>

      {project!.evaluationQuestions.length > 0 && (
        <div className="eq-ref-list start-section" data-testid="eq-ref-list">
          <h3>Evaluation Questions in “{project!.name}”</h3>
          <p className="hint">Click one to open it.</p>
          {[...project!.evaluationQuestions]
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((eq, i) => (
              <div key={eq.id} className="eq-ref-row">
                <button
                  type="button"
                  className="eq-ref"
                  data-testid={`project-eq-ref-${i}`}
                  onClick={() => {
                    setError(null);
                    openEvaluationQuestion(eq.id);
                  }}
                >
                  <strong>{eq.title || "(untitled)"}</strong>
                  <code>{eq.questionText || "No question text yet"}</code>
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="start-section">
        <h3>Create a new Evaluation Question</h3>
        <label>
          Evaluation Question title
          <input
            data-testid="eq-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button
          type="button"
          data-testid="create-eq"
          onClick={() => {
            if (title.trim() === "") {
              setError("Give the Evaluation Question a title first.");
              return;
            }
            setError(null);
            setTitle("");
            createEQ(title.trim());
          }}
        >
          Create Evaluation Question
        </button>
      </div>

      <hr />
      <button
        type="button"
        className="link-button"
        data-testid="switch-project"
        onClick={() => {
          setError(null);
          setName("");
          setSwitching(true);
        }}
      >
        Switch Project — create or open a different Project
      </button>
      {errorBlock}
    </section>
  );
}
