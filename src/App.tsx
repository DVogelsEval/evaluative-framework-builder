import { useEffect, useState } from "react";
import { loadAutosave, saveAutosave } from "./persistence/local";
import { useStore } from "./store/store";
import { firstIncompleteView } from "./store/wizard";
import { AiHandoffView } from "./views/AiHandoffView";
import { ConnectView } from "./views/ConnectView";
import { ContinuumView } from "./views/ContinuumView";
import { CriterionView } from "./views/CriterionView";
import { DeletedView } from "./views/DeletedView";
import { EvidenceView } from "./views/EvidenceView";
import { HomeView } from "./views/HomeView";
import { MixedMethodsView } from "./views/MixedMethodsView";
import { NodesView } from "./views/NodesView";
import { NotesPanel } from "./views/NotesPanel";
import { OutputsView } from "./views/OutputsView";
import { QuestionView } from "./views/QuestionView";
import { ReviewView } from "./views/ReviewView";
import { SecondLayerView } from "./views/SecondLayerView";
import { SimulateJudgementView } from "./views/SimulateJudgementView";
import { StartView } from "./views/StartView";
import { StructureView } from "./views/StructureView";
import { SynthesisView } from "./views/SynthesisView";

export function App() {
  const view = useStore((s) => s.view);
  const doc = useStore((s) => s.doc);
  const project = useStore((s) => s.project);
  const [notesOpen, setNotesOpen] = useState(false);

  // Restore the autosaved session once, then autosave every change (R-014).
  useEffect(() => {
    const restored = loadAutosave();
    if (restored.doc) {
      useStore.getState().loadDocument(restored.doc, restored.project);
      useStore.getState().setView(firstIncompleteView(restored.doc));
    } else if (restored.project) {
      useStore.setState({ project: restored.project });
    }
    return useStore.subscribe((s) => saveAutosave(s.project, s.doc));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Evaluative Framework Builder</h1>
        <div className="header-context">
          {project && <span data-testid="header-project">{project.name}</span>}
          {doc && <span data-testid="header-eq">{doc.title}</span>}
          {/* Exiting to view progress is always possible mid-build (R-027). */}
          {doc && view !== "home" && view !== "start" && (
            <button
              type="button"
              data-testid="go-home"
              onClick={() => useStore.getState().setView("home")}
            >
              Home Window
            </button>
          )}
          {/* The per-EQ Notes pop-out is reachable from every view (R-030, Q19). */}
          {doc && view !== "start" && (
            <button
              type="button"
              data-testid="notes-toggle"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((open) => !open)}
            >
              Notes
            </button>
          )}
        </div>
      </header>
      <main>
        {view === "start" && <StartView />}
        {view === "question" && <QuestionView />}
        {view === "continuum" && <ContinuumView />}
        {view === "structure" && <StructureView />}
        {view === "nodes" && <NodesView />}
        {view === "criterion" && <CriterionView />}
        {view === "review" && <ReviewView />}
        {view === "evidence" && <EvidenceView />}
        {view === "mixed" && <MixedMethodsView />}
        {view === "connect" && <ConnectView />}
        {view === "secondlayer" && <SecondLayerView />}
        {view === "synthesis" && <SynthesisView />}
        {view === "home" && <HomeView />}
        {view === "outputs" && <OutputsView />}
        {view === "aihandoff" && <AiHandoffView />}
        {view === "simulate" && <SimulateJudgementView />}
        {view === "deleted" && <DeletedView />}
      </main>
      {doc && notesOpen && <NotesPanel onClose={() => setNotesOpen(false)} />}
    </div>
  );
}
