import { migrateEvaluationQuestion, migrateProject } from "../domain/migrate";
import {
  evaluationQuestionSchema,
  projectManifestSchema,
  type EvaluationQuestion,
  type ProjectManifest,
} from "../domain/schema";
import { stableStringify } from "../domain/serialize";

/**
 * Save to disk (R-015, save side pulled forward — ⚠Q48): where the File System
 * Access API exists (Chrome/Edge), the first Save asks where to save and later
 * Saves overwrite that same file — no new download copies (2026-07-14 notes).
 * Elsewhere (Firefox/Safari) Save falls back to a download. Opening still goes
 * via upload; the full R-015 open path arrives in Slice 12.
 */

export function downloadJson(fileName: string, value: unknown): void {
  downloadText(fileName, stableStringify(value), "application/json");
}

/** Download arbitrary text as a file — the client-side export path for the
 *  Markdown and CSV outputs (Slice 8, R-118/R-124, Q21). No backend (Arch §3). */
export function downloadText(
  fileName: string,
  text: string,
  mimeType = "text/plain",
): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Minimal structural types for the File System Access API — lib.dom does not
// (dependably) carry these, and `any` is banned at module boundaries.
interface WritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface SaveFileHandle {
  name: string;
  createWritable(): Promise<WritableFileStream>;
}
type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

const savePicker = (): SaveFilePicker | undefined =>
  (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

// The open picker returns handles that can also be written back — a
// FileSystemFileHandle carries both `getFile()` and `createWritable()`.
interface OpenFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileStream>;
}
type OpenFilePicker = (options?: {
  types?: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}) => Promise<OpenFileHandle[]>;

const openPicker = (): OpenFilePicker | undefined =>
  (globalThis as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;

/** True when the browser can open (and write back to) a file in place
 *  (Chrome/Edge). Elsewhere the app falls back to an `<input type=file>` upload
 *  and, on Save, a download (R-015). */
export function supportsFileSystemAccess(): boolean {
  return openPicker() !== undefined;
}

/** Remembered per app session and per document (⚠Q48) — keyed by the saved
 *  entity's id so switching Projects/EQs can never overwrite the wrong file.
 *  Handles cannot persist across reloads; the first Save then asks again. */
const saveHandles = new Map<string, SaveFileHandle>();

/** Register an opened file's handle as the Save target for `documentId`, so the
 *  next Save writes back to the file the user just opened — no fresh picker
 *  (R-015: the open→edit→save loop closes on the File System Access API). */
export function rememberSaveHandle(documentId: string, handle: SaveFileHandle): void {
  saveHandles.set(documentId, handle);
}

export interface PickedFile {
  file: File;
  /** The opened file's handle — pass to `rememberSaveHandle` so a later Save
   *  overwrites this same file in place. */
  handle: SaveFileHandle;
}

/**
 * Open a JSON file via the File System Access API (R-015). Returns the picked
 * file and its (writable) handle, or `undefined` when the user dismissed the
 * picker. Browsers without the API use the `<input type=file>` upload path
 * (`readEvalqFile` / `readProjectFile`) instead — `supportsFileSystemAccess`
 * gates which one the UI shows.
 */
export async function openJsonFromDisk(): Promise<PickedFile | undefined> {
  const picker = openPicker();
  if (!picker) return undefined;
  let handles: OpenFileHandle[];
  try {
    handles = await picker({
      types: [{ description: "JSON file", accept: { "application/json": [".json"] } }],
      multiple: false,
    });
  } catch {
    return undefined; // the user closed the picker
  }
  const handle = handles[0];
  if (!handle) return undefined;
  const file = await handle.getFile();
  return { file, handle };
}

export type SaveOutcome =
  | { result: "saved"; fileName: string }
  | { result: "downloaded"; fileName: string }
  | { result: "cancelled" };

/**
 * Save `value` into the one file for this document (⚠Q48): picker on first
 * save, silent overwrite of the same file thereafter; download fallback where
 * the API is missing; cancelling the picker saves nothing.
 */
export async function saveJsonToDisk(
  documentId: string,
  fileName: string,
  value: unknown,
): Promise<SaveOutcome> {
  // A remembered handle (from a prior Save, or from opening the file in place —
  // R-015) writes back without a picker, even on the rare browser that has the
  // open API but not the save one.
  let handle = saveHandles.get(documentId);
  if (!handle) {
    const picker = savePicker();
    if (!picker) {
      downloadJson(fileName, value);
      return { result: "downloaded", fileName };
    }
    try {
      handle = await picker({
        suggestedName: fileName,
        types: [{ description: "JSON file", accept: { "application/json": [".json"] } }],
      });
    } catch {
      return { result: "cancelled" }; // the user closed the picker
    }
    saveHandles.set(documentId, handle);
  }
  try {
    const writable = await handle.createWritable();
    await writable.write(stableStringify(value));
    await writable.close();
    return { result: "saved", fileName: handle.name };
  } catch {
    // Permission lost or the write failed — forget the handle and never
    // silently lose work (R-014): hand the bytes over as a download.
    saveHandles.delete(documentId);
    downloadJson(fileName, value);
    return { result: "downloaded", fileName };
  }
}

/** Parse an uploaded `.evalq.json`: JSON → migrate → canonical schema. */
export async function readEvalqFile(file: File): Promise<EvaluationQuestion> {
  const text = await file.text();
  const migrated = migrateEvaluationQuestion(JSON.parse(text));
  return evaluationQuestionSchema.parse(migrated);
}

/** Parse an uploaded Project file: JSON → migrate → canonical schema. Its
 *  embedded Evaluation Questions are listed in the Open view (R-008, GWT-1.4). */
export async function readProjectFile(file: File): Promise<ProjectManifest> {
  const text = await file.text();
  return projectManifestSchema.parse(migrateProject(JSON.parse(text)));
}
