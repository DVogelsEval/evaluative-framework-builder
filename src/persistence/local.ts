import { migrateEvaluationQuestion, migrateProject } from "../domain/migrate";
import {
  evaluationQuestionSchema,
  projectManifestSchema,
  type EvaluationQuestion,
  type ProjectManifest,
} from "../domain/schema";

/** Autosave to local storage — never silently lose work (ARCHITECTURE §3, R-014).
 *  Loading runs the migration chain first, so an autosave from an older schema
 *  survives an app upgrade just like an opened file does. */

const DOC_KEY = "efb.autosave.evalq.v1";
const PROJECT_KEY = "efb.autosave.project.v1";

export function saveAutosave(
  project: ProjectManifest | null,
  doc: EvaluationQuestion | null,
): void {
  if (doc) localStorage.setItem(DOC_KEY, JSON.stringify(doc));
  if (project) localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
}

export function loadAutosave(): {
  project: ProjectManifest | null;
  doc: EvaluationQuestion | null;
} {
  return {
    doc: parseStored(DOC_KEY, (raw) =>
      evaluationQuestionSchema.safeParse(migrateEvaluationQuestion(raw)),
    ),
    project: parseStored(PROJECT_KEY, (raw) =>
      projectManifestSchema.safeParse(migrateProject(raw)),
    ),
  };
}

function parseStored<T>(
  key: string,
  parse: (raw: unknown) => { success: true; data: T } | { success: false },
): T | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const result = parse(JSON.parse(stored));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
